import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { tasks, lang = 'ru' } = await req.json();

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({
        success: true,
        script:
          lang === 'en'
            ? 'No tasks scheduled for tomorrow.'
            : 'На завтра задач пока нет. Можно отдыхать!',
        audioUrl: null,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });
    }

    const taskTitles = tasks
      .map(
        (t: { title?: string; text?: string }, idx: number) =>
          `${idx + 1}. ${t.title || t.text || ''}`
      )
      .join('\n');

    const systemPrompt =
      lang === 'en'
        ? `You are a warm, witty female personal assistant. Create a lively, smooth 30-45 second spoken monologue reminding the user about their upcoming tasks for tomorrow.
STRICT RULES:
- Do NOT use bullet points, numbering, or lists.
- Do NOT say "Task 1", "Task 2". Connect everything naturally into human speech.
- Output ONLY the final plain text for speech synthesis.`
        : `Ты — заботливая и слегка ироничная девушка-ассистент. Составь живой связный монолог на 30–45 секунд, напоминая пользователю о его планах на завтра.
СТРОГИЕ ПРАВИЛА:
- Никаких списков, маркеров и нумерации.
- Не говори "Задача один", "Задача два". Свяжи всё в плавную разговорную речь.
- Верни ТОЛЬКО готовый текст для озвучки без комментариев и пометок.`;

    const userPrompt = `Here are the tasks for tomorrow:\n${taskTitles}\n\nDeliver the assistant spoken script now:`;

    // 1. Generate text via Gemini Flash
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return NextResponse.json({ error: `Gemini API error: ${err}` }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const script =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // 2. Synthesize audio on Oracle Backend
    const ORACLE_TTS_URL =
      process.env.ORACLE_TTS_API_URL || 'http://130.61.208.40:8000/synthesize-task-audio';
    const voice = lang === 'en' ? 'en-US-JennyNeural' : 'ru-RU-SvetlanaNeural';
    const filename = lang === 'en' ? 'today_tasks_en.mp3' : 'today_tasks.mp3';

    const ttsRes = await fetch(ORACLE_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: script,
        voice: voice,
        filename: filename,
      }),
    });

    if (!ttsRes.ok) {
      const ttsErr = await ttsRes.text();
      return NextResponse.json(
        {
          error: `Oracle TTS failed (${ttsRes.status}): ${ttsErr}`,
          script: script,
        },
        { status: 500 }
      );
    }

    const ttsData = await ttsRes.json();

    return NextResponse.json({
      success: true,
      script: script,
      audioUrl: ttsData.audioUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
