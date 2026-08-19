import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ formattedText: text || '' }, { status: 200 });
    }

    const rawText = text.trim();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('[Morning Oracle Server] GEMINI_API_KEY environment variable is not defined. Returning raw text.');
      return NextResponse.json({ formattedText: rawText }, { status: 200 });
    }

    const promptText = `You are an expert voice transcription punctuation and formatting assistant. Take the user's raw transcribed text, correct capitalization, add appropriate punctuation (periods, commas, question marks), and fix obvious speech recognition typos. Keep the exact original meaning and language. Return ONLY the cleaned text, without quotes, backticks, or extra commentary.\n\nInput text:\n${rawText}`;

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
      const errorPayload = await response.text();
      console.error('Gemini API Error:', errorPayload);
      return NextResponse.json({ formattedText: rawText }, { status: 200 });
    }

    const data = await response.json();
    const candidateText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || rawText;

    // Strip any accidental markdown formatting or quotes
    const cleanedText = candidateText.replace(/^["'`]|["'`]$/g, '').trim();

    return NextResponse.json({ formattedText: cleanedText || rawText }, { status: 200 });
  } catch (error: any) {
    console.error('Gemini API Error (Exception):', error);
    return NextResponse.json({ formattedText: '' }, { status: 200 });
  }
}
