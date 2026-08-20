import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('file') as Blob | null;
    const language = (formData.get('language') as string) || 'ru';

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[Morning Oracle Server] GEMINI_API_KEY is not defined.');
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing' }, { status: 500 });
    }

    // Convert audio Blob to base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');
    const mimeType = audioFile.type || 'audio/webm';

    console.log(`[Morning Oracle Server] Received audio (${buffer.length} bytes, type: ${mimeType}, lang: ${language})`);

    const promptText = `Transcribe this audio recording verbatim in the original language (${
      language === 'en' ? 'English' : 'Russian'
    }). Format the transcription with correct capitalization, appropriate punctuation (periods, commas, question marks), and fix obvious speech filler. Return ONLY the transcribed clean text, without quotes, backticks, or any conversational commentary.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType.split(';')[0] || 'audio/webm',
                  data: base64Audio,
                },
              },
              {
                text: promptText,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[Morning Oracle Server] Gemini 3.6 audio transcription error, trying gemini-1.5-flash:', response.status, errorText);

      const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const fallbackRes = await fetch(fallbackEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType.split(';')[0] || 'audio/webm',
                    data: base64Audio,
                  },
                },
                { text: promptText },
              ],
            },
          ],
          generationConfig: { temperature: 0.1 },
        }),
      });

      if (!fallbackRes.ok) {
        const fallbackError = await fallbackRes.text();
        console.error('[Morning Oracle Server] Both Gemini endpoints failed for audio transcription:', fallbackError);
        return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 });
      }

      const fallbackData = await fallbackRes.json();
      const transcribed =
        fallbackData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      const clean = transcribed.replace(/^["'`]|["'`]$/g, '').trim();
      return NextResponse.json({ formattedText: clean }, { status: 200 });
    }

    const data = await response.json();
    const candidateText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const cleanedText = candidateText.replace(/^["'`]|["'`]$/g, '').trim();

    console.log('[Morning Oracle Server] Gemini transcription completed:', cleanedText);
    return NextResponse.json({ formattedText: cleanedText }, { status: 200 });
  } catch (error: any) {
    console.error('[Morning Oracle Server] Unhandled error in /api/transcribe:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
