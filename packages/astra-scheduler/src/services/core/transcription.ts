import { readFileSync } from 'fs';
import { Logger } from '../../utils/logger';
import { GEMINI_MODEL } from '../config';

export interface TranscriptionResult {
  text: string;
  success: boolean;
  error?: string;
  confidence?: number;
  isGarbage?: boolean;
  garbageReason?: string;
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
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`,
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
                      text: `Analyze this audio recording and provide a transcription with quality assessment.

Return ONLY valid JSON in this exact format:
{
  "transcription": "The transcribed text exactly as spoken, or empty string if no speech",
  "confidence": <number 0-100>,
  "isGarbage": <boolean>,
  "garbageReason": "<string or null>"
}

Quality assessment rules:
- confidence 80-100: Clear speech with understandable content
- confidence 50-79: Partially audible speech, some unclear portions
- confidence 20-49: Mostly noise with possible fragments of speech
- confidence 0-19: No discernible speech (pure noise, silence, button sounds)

Mark isGarbage=true if ANY of these apply:
- Less than 2 words of actual speech
- Only background noise, static, or ambient sounds
- Recording is mostly silence
- Speech is completely unintelligible
- Only sounds like button clicks, breathing, or non-verbal sounds

If isGarbage=true, set garbageReason to explain why.
Return ONLY the JSON, no markdown or explanation.`,
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
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
          lastError = 'No response returned from API';
          logger.warn(lastError);
          continue;
        }

        const parsed = this.parseTranscriptionResponse(responseText);
        if (!parsed) {
          lastError = 'Invalid JSON response from transcription API';
          logger.warn(`${lastError}: ${responseText}`);
          continue;
        }

        const status = parsed.isGarbage ? 'flagged as garbage' : 'successful';
        logger.info(
          `Transcription ${status} (confidence: ${parsed.confidence}%):\n${parsed.transcription}`
        );

        return {
          text: parsed.transcription,
          success: true,
          confidence: parsed.confidence,
          isGarbage: parsed.isGarbage,
          garbageReason: parsed.garbageReason || undefined,
        };
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

  private parseTranscriptionResponse(text: string): {
    transcription: string;
    confidence: number;
    isGarbage: boolean;
    garbageReason: string | null;
  } | null {
    try {
      const cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);

      if (
        typeof parsed.transcription !== 'string' ||
        typeof parsed.confidence !== 'number' ||
        typeof parsed.isGarbage !== 'boolean'
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }
}
