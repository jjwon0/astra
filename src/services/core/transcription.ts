import { readFileSync } from 'fs';
import { Logger } from '../../utils/logger';

export interface TranscriptionResult {
  text: string;
  success: boolean;
  error?: string;
}

export class TranscriptionService {
  private apiKey: string;
  private maxRetries: number = 3;

  constructor(apiKey: string, maxRetries: number = 3) {
    this.apiKey = apiKey;
    this.maxRetries = maxRetries;
  }

  async transcribe(filePath: string, logger: Logger): Promise<TranscriptionResult> {
    const backoffDelays = [1000, 5000, 30000];
    let lastError: string = '';

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        logger.info(`Transcribing ${filePath} (attempt ${attempt + 1}/${this.maxRetries})`);

        const audioBuffer = readFileSync(filePath);
        const base64Audio = audioBuffer.toString('base64');

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: 'Transcribe the following audio exactly as spoken. Only output the transcription, nothing else.',
                    },
                    {
                      inline_data: {
                        mime_type: this.getMimeType(filePath),
                        data: base64Audio,
                      },
                    },
                  ],
                },
              ],
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          lastError = `API error: ${response.status} - ${errorText}`;
          logger.warn(`Transcription attempt ${attempt + 1} failed: ${lastError}`);

          if (attempt < this.maxRetries - 1) {
            const delay = backoffDelays[attempt] || 30000;
            logger.info(`Retrying in ${delay}ms...`);
            await this.sleep(delay);
          }
          continue;
        }

        const data = (await response.json()) as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
          lastError = 'No transcription text returned from API';
          logger.warn(lastError);
          continue;
        }

        logger.info(
          `Transcription successful: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`
        );
        return { text, success: true };
      } catch (error: any) {
        lastError = error.message || String(error);
        logger.warn(`Transcription attempt ${attempt + 1} failed: ${lastError}`);

        if (attempt < this.maxRetries - 1) {
          const delay = backoffDelays[attempt] || 30000;
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    logger.error(`Transcription failed after ${this.maxRetries} attempts: ${lastError}`);
    return { text: '', success: false, error: lastError };
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    if (ext === 'm4a') return 'audio/mp4';
    if (ext === 'wav') return 'audio/wav';
    return 'audio/mpeg';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
