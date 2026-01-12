import { Client } from '@notionhq/client';
import { Logger } from '../../utils/logger';

export interface JournalSyncResult {
  success: boolean;
  pageId: string;
  isNewPage: boolean;
  error?: string;
}

export class JournalNotionService {
  private notion: Client;
  private journalDatabaseId: string;
  private maxRetries: number;

  constructor(apiKey: string, journalDatabaseId: string, maxRetries: number = 3) {
    this.notion = new Client({ auth: apiKey });
    this.journalDatabaseId = journalDatabaseId;
    this.maxRetries = maxRetries;
  }

  async syncEntry(
    formattedText: string,
    timestamp: Date,
    logger: Logger
  ): Promise<JournalSyncResult> {
    const backoffDelays = [1000, 5000, 30000];
    let lastError: string = '';

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        logger.info(`Syncing journal entry (attempt ${attempt + 1}/${this.maxRetries})`);

        const dateString = this.formatDateISO(timestamp);
        const existingPageId = await this.findTodayPage(dateString, logger);

        if (existingPageId) {
          await this.appendEntry(existingPageId, formattedText, timestamp, logger);
          logger.info(`Appended journal entry to existing page: ${existingPageId}`);
          return { success: true, pageId: existingPageId, isNewPage: false };
        } else {
          const newPageId = await this.createDayPage(timestamp, formattedText, logger);
          logger.info(`Created new journal page: ${newPageId}`);
          return { success: true, pageId: newPageId, isNewPage: true };
        }
      } catch (error: any) {
        lastError = error.message || String(error);
        logger.warn(`Journal sync attempt ${attempt + 1} failed: ${lastError}`);

        if (attempt < this.maxRetries - 1) {
          const delay = backoffDelays[attempt] || 30000;
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    logger.error(`Journal sync failed after ${this.maxRetries} attempts: ${lastError}`);
    return { success: false, pageId: '', isNewPage: false, error: lastError };
  }

  private async findTodayPage(dateString: string, logger: Logger): Promise<string | null> {
    try {
      const response = await this.notion.databases.query({
        database_id: this.journalDatabaseId,
        filter: {
          property: 'date',
          date: {
            equals: dateString,
          },
        },
      });

      if (response.results.length > 0) {
        return response.results[0].id;
      }
      return null;
    } catch (error: any) {
      logger.warn(`Error querying for today's page: ${error.message}`);
      throw error;
    }
  }

  private async createDayPage(
    timestamp: Date,
    formattedText: string,
    logger: Logger
  ): Promise<string> {
    const dateString = this.formatDateISO(timestamp);
    const titleString = this.formatDateTitle(timestamp);
    const timeString = this.formatTimestamp(timestamp);

    const response = await this.notion.pages.create({
      parent: { database_id: this.journalDatabaseId },
      properties: {
        title: {
          title: [{ text: { content: titleString } }],
        },
        date: {
          date: { start: dateString },
        },
        processed: {
          checkbox: false,
        },
      },
      children: this.buildEntryBlocks(formattedText, timeString, true),
    });

    return response.id;
  }

  private async appendEntry(
    pageId: string,
    formattedText: string,
    timestamp: Date,
    logger: Logger
  ): Promise<void> {
    const timeString = this.formatTimestamp(timestamp);

    await this.notion.blocks.children.append({
      block_id: pageId,
      children: this.buildEntryBlocks(formattedText, timeString, false),
    });
  }

  private buildEntryBlocks(
    formattedText: string,
    timeString: string,
    isFirst: boolean
  ): any[] {
    const blocks: any[] = [];

    // Add divider if not first entry
    if (!isFirst) {
      blocks.push({
        type: 'divider',
        divider: {},
      });
    }

    // Timestamp heading
    blocks.push({
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: timeString } }],
      },
    });

    // Split text into paragraphs and create blocks
    const paragraphs = formattedText.split(/\n\n+/).filter((p) => p.trim());
    for (const paragraph of paragraphs) {
      // Notion has a 2000 char limit per rich_text block
      const chunks = this.chunkText(paragraph.trim(), 2000);
      for (const chunk of chunks) {
        blocks.push({
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: chunk } }],
          },
        });
      }
    }

    return blocks;
  }

  private chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point (space, period, etc.)
      let breakIndex = remaining.lastIndexOf(' ', maxLength);
      if (breakIndex === -1 || breakIndex < maxLength / 2) {
        breakIndex = maxLength;
      }

      chunks.push(remaining.slice(0, breakIndex));
      remaining = remaining.slice(breakIndex).trim();
    }

    return chunks;
  }

  private formatDateISO(date: Date): string {
    // Use local date components to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateTitle(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
