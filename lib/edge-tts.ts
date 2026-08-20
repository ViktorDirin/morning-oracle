import crypto from 'crypto';

const EDGE_TTS_TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_TTS_WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TTS_TRUSTED_TOKEN}`;

export interface EdgeTtsOptions {
  voice?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
}

/**
 * Generate MP3 audio buffer from text using Microsoft Edge Neural TTS.
 * @param text The plain text script to synthesize.
 * @param options Voice options (default: ru-RU-SvetlanaNeural).
 */
export async function synthesizeEdgeTts(
  text: string,
  options: EdgeTtsOptions = {}
): Promise<Buffer> {
  const voice = options.voice || 'ru-RU-SvetlanaNeural';
  const rate = options.rate || '+0%';
  const pitch = options.pitch || '+0Hz';
  const volume = options.volume || '+0%';

  const requestId = crypto.randomBytes(16).toString('hex');
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${voice.slice(0, 5)}'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${escapedText}</prosody></voice></speak>`;

  return new Promise((resolve, reject) => {
    // Use globalThis.WebSocket provided by Node.js 20+ / Next.js
    const WebSocketImpl = (globalThis as any).WebSocket;
    if (!WebSocketImpl) {
      return reject(new Error('WebSocket is not available in current Node runtime'));
    }

    const ws = new WebSocketImpl(EDGE_TTS_WSS_URL, {
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      },
    });

    const audioChunks: Buffer[] = [];
    let isFinished = false;

    const timeout = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        try {
          ws.close();
        } catch {}
        if (audioChunks.length > 0) {
          resolve(Buffer.concat(audioChunks));
        } else {
          reject(new Error('Edge-TTS request timed out'));
        }
      }
    }, 15000);

    ws.onopen = () => {
      const timestamp = new Date().toISOString();

      // 1. Send speech config
      const configMessage =
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: 'false',
                  wordBoundaryEnabled: 'false',
                },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        });
      ws.send(configMessage);

      // 2. Send SSML payload
      const ssmlMessage =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${timestamp}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;
      ws.send(ssmlMessage);
    };

    ws.onmessage = async (event: any) => {
      const data = event.data;

      if (typeof data === 'string') {
        if (data.includes('Path:turn.end')) {
          if (!isFinished) {
            isFinished = true;
            clearTimeout(timeout);
            try {
              ws.close();
            } catch {}
            resolve(Buffer.concat(audioChunks));
          }
        }
      } else {
        // Binary audio chunk
        let buffer: Buffer;
        if (data instanceof ArrayBuffer) {
          buffer = Buffer.from(data);
        } else if (Buffer.isBuffer(data)) {
          buffer = data;
        } else if (data instanceof Blob) {
          const ab = await data.arrayBuffer();
          buffer = Buffer.from(ab);
        } else {
          buffer = Buffer.from(data);
        }

        // Binary frame has a 2-byte header length at index 0..1
        if (buffer.length > 2) {
          const headerLength = buffer.readUInt16BE(0);
          if (buffer.length > 2 + headerLength) {
            const audioData = buffer.subarray(2 + headerLength);
            audioChunks.push(audioData);
          }
        }
      }
    };

    ws.onerror = (err: any) => {
      console.warn('[Morning Oracle Edge-TTS] WebSocket error:', err);
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        if (audioChunks.length > 0) {
          resolve(Buffer.concat(audioChunks));
        } else {
          reject(err);
        }
      }
    };

    ws.onclose = () => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        if (audioChunks.length > 0) {
          resolve(Buffer.concat(audioChunks));
        } else {
          reject(new Error('Edge-TTS connection closed unexpectedly without audio'));
        }
      }
    };
  });
}
