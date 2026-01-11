import { Logger } from '../../utils/logger';

export interface JournalFormatResult {
  formattedText: string;
  success: boolean;
  error?: string;
}

export class JournalService {
  private apiKey: string;
  private maxRetries: number;

  constructor(apiKey: string, maxRetries: number = 3) {
    this.apiKey = apiKey;
    this.maxRetries = maxRetries;
  }

  async format(transcript: string, logger: Logger): Promise<JournalFormatResult> {
    const backoffDelays = [1000, 5000, 30000];
    let lastError: string = '';

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        logger.info(`Formatting journal entry (attempt ${attempt + 1}/${this.maxRetries})`);

        const prompt = this.buildPrompt(transcript);
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
                      text: prompt,
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
          logger.warn(`Journal formatting attempt ${attempt + 1} failed: ${lastError}`);

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
          lastError = 'No text returned from API';
          logger.warn(lastError);
          continue;
        }

        const formattedText = text.trim();
        logger.info(`Journal formatting successful (${formattedText.length} chars)`);
        return { formattedText, success: true };
      } catch (error: any) {
        lastError = error.message || String(error);
        logger.warn(`Journal formatting attempt ${attempt + 1} failed: ${lastError}`);

        if (attempt < this.maxRetries - 1) {
          const delay = backoffDelays[attempt] || 30000;
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    logger.error(`Journal formatting failed after ${this.maxRetries} attempts: ${lastError}`);
    return { formattedText: '', success: false, error: lastError };
  }

  private buildPrompt(transcript: string): string {
    return `Clean up the following voice journal transcript.

Instructions:
1. Remove filler words (um, uh, like, you know, I mean, basically, actually, sort of, kind of)
2. Fix grammar and punctuation
3. Format into natural paragraphs at topic or thought changes
4. Preserve the original meaning and tone
5. Keep it conversational but polished
6. Do NOT add any commentary, headers, or metadata
7. Return ONLY the cleaned text, nothing else

Transcript:
${transcript}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
