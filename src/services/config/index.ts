import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

dotenv.config();

export interface NotionSchema {
  todoDatabaseId: string;
  notesDatabaseId: string;
  priorities: string[];
  categories: string[];
}

export interface ConfigEnv {
  GEMINI_API_KEY: string;
  NOTION_API_KEY: string;
  NOTION_TODO_DATABASE_ID?: string;
  NOTION_NOTES_DATABASE_ID?: string;
  PARENT_PAGE_ID: string;
  VOICE_MEMOS_DIR: string;
  ARCHIVE_DIR: string;
  FAILED_DIR: string;
  LOG_FILE: string;
  VOICE_MEMO_JOB_ENABLED: string;
  VOICE_MEMO_JOB_INTERVAL_MINUTES: string;
  MAX_RETRIES: string;
}

export class ConfigService {
  private env: ConfigEnv;
  private notion: Client;
  private schema: NotionSchema | null = null;

  constructor() {
    this.env = this.loadEnv();
    this.notion = new Client({ auth: this.env.NOTION_API_KEY });
  }

  private loadEnv(): ConfigEnv {
    const requiredVars = ['GEMINI_API_KEY', 'NOTION_API_KEY', 'PARENT_PAGE_ID'];
    const missingVars: string[] = [];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
      NOTION_API_KEY: process.env.NOTION_API_KEY!,
      NOTION_TODO_DATABASE_ID: process.env.NOTION_TODO_DATABASE_ID,
      NOTION_NOTES_DATABASE_ID: process.env.NOTION_NOTES_DATABASE_ID,
      PARENT_PAGE_ID: process.env.PARENT_PAGE_ID!,
      VOICE_MEMOS_DIR: process.env.VOICE_MEMOS_DIR || '~/VoiceMemos',
      ARCHIVE_DIR: process.env.ARCHIVE_DIR || './archive',
      FAILED_DIR: process.env.FAILED_DIR || './failed',
      LOG_FILE: process.env.LOG_FILE || './logs/astra.log',
      VOICE_MEMO_JOB_ENABLED: process.env.VOICE_MEMO_JOB_ENABLED || 'true',
      VOICE_MEMO_JOB_INTERVAL_MINUTES: process.env.VOICE_MEMO_JOB_INTERVAL_MINUTES || '5',
      MAX_RETRIES: process.env.MAX_RETRIES || '3'
    };
  }

  async initialize(): Promise<void> {
    await this.setupNotionDatabases();
    await this.fetchSchema();
  }

  private async setupNotionDatabases(): Promise<void> {
    const todoDbId = this.env.NOTION_TODO_DATABASE_ID;
    const notesDbId = this.env.NOTION_NOTES_DATABASE_ID;
    const parentPageId = this.env.PARENT_PAGE_ID;

    const needsTodoDb = !todoDbId;
    const needsNotesDb = !notesDbId;

    if (!needsTodoDb && !needsNotesDb) {
      return;
    }

    try {
      if (needsTodoDb) {
        const db = await this.createTodoDatabase(parentPageId);
        this.env.NOTION_TODO_DATABASE_ID = db.id;
        console.log(`Created TODO database: ${db.id}`);
      }

      if (needsNotesDb) {
        const db = await this.createNotesDatabase(parentPageId);
        this.env.NOTION_NOTES_DATABASE_ID = db.id;
        console.log(`Created Notes database: ${db.id}`);
      }

      await this.updateEnvFile();
      console.log('Created Notion databases. IDs written to .env. Restart to load schema.');
    } catch (error: any) {
      throw new Error(`Failed to setup Notion databases: ${error.message}`);
    }
  }

  private async createTodoDatabase(parentPageId: string): Promise<any> {
    return await this.notion.databases.create({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: 'TODOs' } }],
      properties: {
        title: { title: {} },
        description: { rich_text: {} },
        priority: {
          select: {
            options: [
              { name: 'asap', color: 'red' },
              { name: 'soon', color: 'yellow' },
              { name: 'eventually', color: 'gray' }
            ]
          }
        },
        status: {
          select: {
            options: [
              { name: 'not started', color: 'gray' },
              { name: 'in progress', color: 'blue' },
              { name: 'done', color: 'green' }
            ]
          }
        },
        created_date: { date: {} },
        source: { rich_text: {} }
      }
    });
  }

  private async createNotesDatabase(parentPageId: string): Promise<any> {
    return await this.notion.databases.create({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: 'Notes' } }],
      properties: {
        title: { title: {} },
        content: { rich_text: {} },
        category: {
          select: {
            options: [
              { name: 'project idea', color: 'purple' },
              { name: 'feature idea', color: 'blue' },
              { name: 'research item', color: 'orange' },
              { name: 'general', color: 'gray' }
            ]
          }
        },
        created_date: { date: {} },
        source: { rich_text: {} }
      }
    });
  }

  private async fetchSchema(): Promise<void> {
    const todoDbId = this.env.NOTION_TODO_DATABASE_ID;
    const notesDbId = this.env.NOTION_NOTES_DATABASE_ID;

    if (!todoDbId || !notesDbId) {
      throw new Error('Database IDs not available. Please restart after database setup.');
    }

    try {
      const [todoDb, notesDb] = await Promise.all([
        this.notion.databases.retrieve({ database_id: todoDbId }),
        this.notion.databases.retrieve({ database_id: notesDbId })
      ]);

      const priorities = this.extractSelectOptions(todoDb, 'priority');
      const categories = this.extractSelectOptions(notesDb, 'category');

      this.schema = {
        todoDatabaseId: todoDbId,
        notesDatabaseId: notesDbId,
        priorities,
        categories
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch Notion schema: ${error.message}`);
    }
  }

  private extractSelectOptions(database: any, propertyName: string): string[] {
    const property = database.properties[propertyName];
    if (!property || !property.select || !property.select.options) {
      return [];
    }
    return property.select.options.map((opt: any) => opt.name);
  }

  private async updateEnvFile(): Promise<void> {
    const envPath = resolve(process.cwd(), '.env');
    let envContent = '';

    try {
      envContent = readFileSync(envPath, 'utf-8');
    } catch {
      envContent = '';
    }

    const lines = envContent.split('\n');
    const updatedLines = lines.filter(line => {
      return !line.startsWith('NOTION_TODO_DATABASE_ID=') && !line.startsWith('NOTION_NOTES_DATABASE_ID=');
    });

    if (this.env.NOTION_TODO_DATABASE_ID) {
      updatedLines.push(`NOTION_TODO_DATABASE_ID=${this.env.NOTION_TODO_DATABASE_ID}`);
    }

    if (this.env.NOTION_NOTES_DATABASE_ID) {
      updatedLines.push(`NOTION_NOTES_DATABASE_ID=${this.env.NOTION_NOTES_DATABASE_ID}`);
    }

    writeFileSync(envPath, updatedLines.join('\n'));
  }

  getEnv(): ConfigEnv {
    return this.env;
  }

  getSchema(): NotionSchema {
    if (!this.schema) {
      throw new Error('Schema not initialized. Call initialize() first.');
    }
    return this.schema;
  }

  async refreshSchema(): Promise<void> {
    await this.fetchSchema();
  }
}
