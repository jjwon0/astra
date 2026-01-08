import { Client } from '@notionhq/client';
import { NotionSchema } from '../config';
import { OrganizationItem } from './organization';
import { Logger } from '../../utils/logger';

export interface SyncResult {
  itemsCreated: number;
  itemsFailed: number;
  success: boolean;
  errors: string[];
}

export class NotionSyncService {
  private notion: Client;
  private schema: NotionSchema;
  private maxRetries: number = 3;

  constructor(apiKey: string, schema: NotionSchema, maxRetries: number = 3) {
    this.notion = new Client({ auth: apiKey });
    this.schema = schema;
    this.maxRetries = maxRetries;
  }

  async sync(items: OrganizationItem[], filename: string, logger: Logger): Promise<SyncResult> {
    const result: SyncResult = {
      itemsCreated: 0,
      itemsFailed: 0,
      success: true,
      errors: [],
    };

    logger.info(`Syncing ${items.length} item(s) to Notion`);

    for (const item of items) {
      try {
        const isValid = this.validateItem(item, logger);
        if (!isValid) {
          result.itemsFailed++;
          result.errors.push(`Invalid item: ${item.title}`);
          continue;
        }

        if (item.type === 'TODO') {
          await this.createTodo(item, filename, logger);
        } else {
          await this.createNote(item, filename, logger);
        }

        result.itemsCreated++;
        logger.info(`Created ${item.type}: ${item.title}`);
      } catch (error: any) {
        result.itemsFailed++;
        result.errors.push(error.message || String(error));
        result.success = false;
        logger.error(`Failed to sync item: ${error.message || String(error)}`);
      }
    }

    logger.info(`Sync complete: ${result.itemsCreated} created, ${result.itemsFailed} failed`);

    return result;
  }

  private validateItem(item: OrganizationItem, logger: Logger): boolean {
    if (item.type === 'TODO') {
      if (!this.schema.priorities.includes(item.priority)) {
        logger.warn(`Invalid priority '${item.priority}' for TODO '${item.title}', skipping`);
        return false;
      }
    } else if (item.type === 'NOTE') {
      if (item.category && !this.schema.categories.includes(item.category)) {
        logger.warn(`Invalid category '${item.category}' for NOTE '${item.title}', skipping`);
        return false;
      }
    }
    return true;
  }

  private async createTodo(
    item: OrganizationItem,
    filename: string,
    logger: Logger
  ): Promise<void> {
    const backoffDelays = [1000, 5000, 30000];

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.notion.pages.create({
          parent: { database_id: this.schema.todoDatabaseId },
          properties: {
            title: {
              title: [{ text: { content: item.title } }],
            },
            description: item.description
              ? {
                  rich_text: [{ text: { content: item.description } }],
                }
              : {
                  rich_text: [],
                },
            priority: {
              select: { name: item.priority },
            },
            status: {
              select: { name: 'not started' },
            },
            created_date: {
              date: { start: new Date().toISOString().split('T')[0] },
            },
            source: {
              rich_text: [{ text: { content: filename } }],
            },
          },
        });
        return;
      } catch (error: any) {
        const errorMessage = error.message || String(error);
        logger.warn(`Create TODO attempt ${attempt + 1} failed: ${errorMessage}`);

        if (attempt < this.maxRetries - 1) {
          const delay = backoffDelays[attempt] || 30000;
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }
  }

  private async createNote(
    item: OrganizationItem,
    filename: string,
    logger: Logger
  ): Promise<void> {
    const backoffDelays = [1000, 5000, 30000];

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.notion.pages.create({
          parent: { database_id: this.schema.notesDatabaseId },
          properties: {
            title: {
              title: [{ text: { content: item.title } }],
            },
            content: item.content
              ? {
                  rich_text: [{ text: { content: item.content } }],
                }
              : {
                  rich_text: [],
                },
            category: {
              select: { name: item.category || 'general' },
            },
            created_date: {
              date: { start: new Date().toISOString().split('T')[0] },
            },
            source: {
              rich_text: [{ text: { content: filename } }],
            },
          },
        });
        return;
      } catch (error: any) {
        const errorMessage = error.message || String(error);
        logger.warn(`Create NOTE attempt ${attempt + 1} failed: ${errorMessage}`);

        if (attempt < this.maxRetries - 1) {
          const delay = backoffDelays[attempt] || 30000;
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
