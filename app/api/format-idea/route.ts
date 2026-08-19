import { NextRequest, NextResponse } from 'next/navigation';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ formattedText: text || '' }, { status: 200 });
    }

    const rawText = text.trim();
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('[Morning Oracle] GEMINI_API_KEY is not defined. Returning raw text.');
      return NextResponse.json({ formattedText: rawText }, { status: 200 });
    }

    const systemPrompt =
      "You are a fast punctuation and formatting assistant. Take the user's raw transcribed speech, fix capitalization, insert proper punctuation (periods, commas, question marks), fix obvious speech-to-text typos, and keep the exact original language (Russian, English, or Ukrainian). Return ONLY the cleaned text, without any explanations, quotes, or markdown.";

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Raw transcription: "${rawText}"`,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: systemPrompt,
            },
          ],
        },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[Morning Oracle] Gemini API error response:', response.status, errorText);
      return NextResponse.json({ formattedText: rawText }, { status: 200 });
    }

    const data = await response.json();
    const candidateText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || rawText;

    // Clean any surrounding quotes if generated
    const cleanedText = candidateText.replace(/^["']|["']$/g, '').trim();

    return NextResponse.json({ formattedText: cleanedText || rawText }, { status: 200 });
  } catch (error: any) {
    console.error('[Morning Oracle] Error in /api/format-idea:', error);
    // Graceful fallback to raw text
    return NextResponse.json({ formattedText: '' }, { status: 200 });
  }
}
