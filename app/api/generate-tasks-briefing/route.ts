import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { synthesizeEdgeTts } from '@/lib/edge-tts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { tasks = [], lang = 'ru' } = await req.json();

    const isEn = lang === 'en';
    const activeTasks: string[] = tasks
      .map((t: any) => (t.text || t.title || '').trim())
      .filter(Boolean);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[Morning Oracle Server] GEMINI_API_KEY is not defined.');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is missing on server' },
        { status: 500 }
      );
    }

    let assistantScript = '';

    if (activeTasks.length === 0) {
      assistantScript = isEn
        ? "Hey, you have zero scheduled tasks for today! Take your time, enjoy your morning coffee, and have an amazing day ahead!"
        : "Слушай, на сегодня у тебя никаких срочных задач не запланировано! Можешь спокойно выпить кофе и провести этот день в свое удовольствие. Отличного дня!";
    } else {
      const taskListFormatted = activeTasks.map((t, idx) => `${idx + 1}. ${t}`).join('\n');

      const systemPrompt = isEn
        ? `You are a witty, warm, caring female personal assistant giving a brief spoken morning briefing to your boss about their planned tasks for today.
CRITICAL RULES:
- Return ONLY the spoken plain text monologue.
- Strictly NO robotic list numbering (NEVER say "Task 1", "Task 2", "First item", etc.).
- Seamlessly weave all the user's tasks into a conversational, energetic 25-45 second spoken reminder.
- NO emojis, NO markdown headers, NO bullet points, NO quotes.
- Example tone: "Hey, quick heads-up on your plans today. You wanted to finish the design review, and make sure you also check the deployment report before lunch. Take it step by step, let's crush it today!"`
        : `Ты — остроумная, заботливая и энергичная персональная ассистентка, которая утром голосом напоминает своему боссу о планах на сегодня.
СТРОГИЕ ПРАВИЛА:
- Верни ТОЛЬКО чистый связный разговорный текст для озвучивания.
- Строго ЗАПРЕЩЕНЫ списки и роботизированная нумерация (НИКОГДА не говори "Задача один", "Задача два", "Пункт первый" и т.д.).
- Органично свяжи все задачи в живой разговорный монолог на 25-45 секунд.
- БЕЗ смайликов/эмодзи, БЕЗ markdown-разметки, БЕЗ кавычек.
- Пример стиля: "Слушай, насчет сегодняшних планов. Ты хотел закончить отчет по проекту, а еще нужно обязательно позвонить в банк до обеда. Постарайся все успеть, я в тебя верю!"`;

      const promptText = `${systemPrompt}\n\nToday's task items to mention:\n${taskListFormatted}`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

      const geminiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 350 },
        }),
      });

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error('[Morning Oracle Server] Gemini task briefing script generation failed:', errText);
        // Fallback script if Gemini is unavailable
        assistantScript = isEn
          ? `Hey, here is a quick reminder of your tasks: ${activeTasks.join(', ')}. Have a wonderful and productive day!`
          : `Привет! Напоминаю твои задачи на сегодня: ${activeTasks.join(', ')}. Желаю отличного и продуктивного дня!`;
      } else {
        const geminiData = await geminiResponse.json();
        const rawScript =
          geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        assistantScript = rawScript.replace(/^["'`]|["'`]$/g, '').trim();
      }
    }

    console.log('[Morning Oracle Server] Generated Task Script:', assistantScript);

    // 2. Synthesize audio with Edge-TTS
    const voice = isEn ? 'en-US-JennyNeural' : 'ru-RU-SvetlanaNeural';
    let audioBuffer: Buffer;

    try {
      console.log(`[Morning Oracle Server] Synthesizing task briefing with Edge-TTS (${voice})...`);
      audioBuffer = await synthesizeEdgeTts(assistantScript, {
        voice,
        rate: '+2%',
        pitch: '+0Hz',
      });
      console.log(`[Morning Oracle Server] Synthesized MP3 audio buffer (${audioBuffer.length} bytes)`);
    } catch (ttsErr: any) {
      console.error('[Morning Oracle Server] Edge-TTS synthesis error:', ttsErr);
      // Return the script even if TTS synthesis fails
      return NextResponse.json({
        success: false,
        script: assistantScript,
        error: 'Edge-TTS synthesis failed: ' + ttsErr.message,
      });
    }

    // 3. Upload to Supabase Storage bucket 'morning_audio'
    const fileName = isEn ? 'today_tasks_en.mp3' : 'today_tasks.mp3';
    console.log(`[Morning Oracle Server] Uploading ${fileName} to Supabase bucket 'morning_audio'...`);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('morning_audio')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('[Morning Oracle Server] Supabase storage upload error:', uploadError);
      return NextResponse.json({
        success: false,
        script: assistantScript,
        error: 'Failed to upload audio to Supabase Storage: ' + uploadError.message,
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from('morning_audio')
      .getPublicUrl(fileName);

    const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    console.log('[Morning Oracle Server] Task briefing audio published successfully:', publicUrl);

    return NextResponse.json({
      success: true,
      script: assistantScript,
      audioUrl: publicUrl,
      taskCount: activeTasks.length,
      voice,
    });
  } catch (error: any) {
    console.error('[Morning Oracle Server] Unhandled error in /api/generate-tasks-briefing:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
