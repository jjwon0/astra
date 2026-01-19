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
  intent?: 'TODO' | 'NOTE' | 'JOURNAL';
}

export class TranscriptionService {
  private apiKey: string;
  private maxRetries: number = 3;

  // HTTP status codes that should NOT be retried
  private readonly nonRetryableStatusCodes = new Set([
    400, // Bad Request
    401, // Unauthorized
    403, // Forbidden
    404, // Not Found
    408, // Request Timeout
    410, // Gone
    429, // Too Many Requests (rate limited)
    451, // Unavailable For Legal Reasons
  ]);

  // HTTP status codes that are permanent client errors
  private readonly permanentClientErrors = new Set([
    400, 401, 403, 404, 410, 451,
  ]);

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
                      text: `Analyze this audio recording and provide a transcription with quality assessment and intent detection.

Return ONLY valid JSON in this exact format:
{
  "transcription": "Cleaned transcription with filler words removed",
  "intent": "TODO" | "NOTE" | "JOURNAL",
  "confidence": <number 0-100>,
  "isGarbage": <boolean>,
  "garbageReason": "<string or null>"
}

TRANSCRIPTION CLEANING:
- Remove filler words: um, uh, like, you know, so, basically, actually, I mean, kind of, sort of
- Remove false starts and repeated words
- Keep the meaningful content intact

INTENT DETECTION:
Determine intent using these rules in order:
1. If the content makes the intent CRYSTAL CLEAR, use that intent
2. If user states an explicit prefix ("todo", "note", "journal"), use that intent
3. Otherwise, default to JOURNAL

Intent types:
- "TODO": A clear task or action item to be done
- "NOTE": A clear piece of information to remember or reference later
- "JOURNAL": Personal reflection, thoughts, experiences, or anything ambiguous

CRITICAL: Be conservative. Only use TODO or NOTE if you are 100% certain. When in doubt, default to JOURNAL.

Examples:
- "Buy milk tomorrow" → intent: "TODO" (crystal clear task)
- "Um, todo, buy milk" → intent: "TODO", transcription: "buy milk"
- "Call the doctor on Monday" → intent: "TODO" (crystal clear task)
- "Note, the API key is abc123" → intent: "NOTE", transcription: "the API key is abc123"
- "The restaurant is at 123 Main St" → intent: "NOTE" (crystal clear reference info)
- "Had a great day at the park" → intent: "JOURNAL" (personal experience)
- "The meeting went well and I should follow up with John" → intent: "JOURNAL" (ambiguous - could be reflection or task, default to journal)
- "I'm thinking about switching jobs" → intent: "JOURNAL" (personal reflection)

QUALITY ASSESSMENT:
- confidence 80-100: Clear speech with understandable content
- confidence 50-79: Partially audible speech, some unclear portions
- confidence 20-49: Mostly noise with possible fragments of speech
- confidence 0-19: No discernible speech (pure noise, silence, button sounds)

GARBAGE DETECTION - Mark isGarbage=true if ANY apply:
- Less than 2 words of actual speech AFTER removing filler words
- Only background noise, static, or ambient sounds
- Recording is mostly silence
- Speech is completely unintelligible
- Only sounds like button clicks, breathing, or non-verbal sounds
- Recording contains ONLY filler words with no meaningful content

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
          const statusCode = response.status;
          lastError = `API error: ${statusCode} - ${errorText}`;
          
          // Check if this is a non-retryable error
          if (this.nonRetryableStatusCodes.has(statusCode)) {
            if (statusCode === 429) {
              logger.error(`Rate limit exceeded (${statusCode}). Will not retry automatically - please retry manually later.`);
            } else if (this.permanentClientErrors.has(statusCode)) {
              logger.error(`Permanent client error (${statusCode}). Will not retry: ${lastError}`);
            } else {
              logger.warn(`Non-retryable error (${statusCode}): ${lastError}`);
            }
            
            // Exit retry loop immediately for non-retryable errors
            return { text: '', success: false, error: lastError };
          }

          logger.warn(`Retriable error (${statusCode}). Attempt ${attempt + 1}/${this.maxRetries} failed: ${lastError}`);

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
          `Transcription ${status} (confidence: ${parsed.confidence}%, intent: ${parsed.intent}):\n${parsed.transcription}`
        );

        return {
          text: parsed.transcription,
          success: true,
          confidence: parsed.confidence,
          isGarbage: parsed.isGarbage,
          garbageReason: parsed.garbageReason || undefined,
          intent: parsed.intent,
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
    intent: 'TODO' | 'NOTE' | 'JOURNAL';
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

      // Validate intent field
      const validIntents = ['TODO', 'NOTE', 'JOURNAL'];
      if (!validIntents.includes(parsed.intent)) {
        // Default to JOURNAL if intent is missing or invalid
        parsed.intent = 'JOURNAL';
      }

      return parsed;
    } catch {
      return null;
    }
  }
}
