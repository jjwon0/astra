import { NotionSchema, GEMINI_MODEL } from '../config';
import { Logger } from '../../utils/logger';

export interface OrganizationItem {
  type: 'TODO' | 'NOTE';
  title: string;
  description?: string;
  content?: string;
  priority: 'asap' | 'soon' | 'eventually';
  category?: string;
}

export interface OrganizationResult {
  items: OrganizationItem[];
  success: boolean;
  error?: string;
}

export class OrganizationService {
  private apiKey: string;
  private maxRetries: number = 3;

  constructor(apiKey: string, maxRetries: number = 3) {
    this.apiKey = apiKey;
    this.maxRetries = maxRetries;
  }

  async organize(
    transcript: string,
    schema: NotionSchema,
    logger: Logger
  ): Promise<OrganizationResult> {
    const backoffDelays = [1000, 5000, 30000];
    let lastError: string = '';

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        logger.info(`Organizing transcript (attempt ${attempt + 1}/${this.maxRetries})`);

        const prompt = this.buildPrompt(transcript, schema);
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
          logger.warn(`Organization attempt ${attempt + 1} failed: ${lastError}`);

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

        const parsed = this.parseJsonResponse(text);
        if (!parsed) {
          lastError = 'Invalid JSON response from AI';
          logger.warn(lastError);

          if (attempt < this.maxRetries - 1) {
            const delay = backoffDelays[attempt] || 30000;
            logger.info(`Retrying in ${delay}ms...`);
            await this.sleep(delay);
          }
          continue;
        }

        // Always include the original transcript for context
        const itemsWithTranscript = parsed.items.map((item: OrganizationItem) => ({
          ...item,
          description: item.type === 'TODO' ? transcript : item.description,
          content: item.type === 'NOTE' ? transcript : item.content,
        }));

        logger.info(`Organization successful: ${itemsWithTranscript.length} item(s) found`);
        return { items: itemsWithTranscript, success: true };
      } catch (error: any) {
        lastError = error.message || String(error);
        logger.warn(`Organization attempt ${attempt + 1} failed: ${lastError}`);

        if (attempt < this.maxRetries - 1) {
          const delay = backoffDelays[attempt] || 30000;
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    logger.error(`Organization failed after ${this.maxRetries} attempts: ${lastError}`);
    return { items: [], success: false, error: lastError };
  }

  private buildPrompt(transcript: string, schema: NotionSchema): string {
    return `Given this transcript, extract all actionable items and notes.

Rules:
- Items with "TODO:", "need to", "remember to" → type: "TODO"
- Other items → type: "NOTE"

Priority triggers for TODOs:
- "asap": urgent, immediate, asap, today, right now
- "soon": tomorrow, this week, in a few days, by Friday
- "eventually": later, sometime, next week, default if not specified

Return JSON with these enums:
- types: ["TODO", "NOTE"]
- priorities: ["asap", "soon", "eventually"]
- categories: ${JSON.stringify(schema.categories)}

Default values:
- priority: "asap"
- category: "general"

Transcript:
${transcript}

Return valid JSON only, no markdown:
{
  "items": [
    {
      "type": "TODO|NOTE",
      "title": "string",
      "description|content": "string",
      "priority": "asap|soon|eventually",
      "category": "project idea|feature idea|..."
    }
  ]
}`;
  }

  private parseJsonResponse(text: string): { items: OrganizationItem[] } | null {
    try {
      const cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed.items || !Array.isArray(parsed.items)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
