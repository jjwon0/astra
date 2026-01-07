import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from './index';
import { Client } from '@notionhq/client';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@notionhq/client', () => ({
  Client: vi.fn(),
}));
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockNotion: any;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.GEMINI_API_KEY = 'test_gemini_key';
    process.env.NOTION_API_KEY = 'test_notion_key';
    process.env.PARENT_PAGE_ID = 'test_parent_page_id';
    process.env.NOTION_TODO_DATABASE_ID = 'test_todo_db_id';
    process.env.NOTION_NOTES_DATABASE_ID = 'test_notes_db_id';

    mockNotion = {
      databases: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    };

    vi.mocked(Client).mockImplementation(() => mockNotion as any);

    configService = new ConfigService();
  });

  describe('constructor', () => {
    it('should load environment variables', () => {
      const env = configService.getEnv();

      expect(env.GEMINI_API_KEY).toBe('test_gemini_key');
      expect(env.NOTION_API_KEY).toBe('test_notion_key');
      expect(env.PARENT_PAGE_ID).toBe('test_parent_page_id');
    });

    it('should use default values when not provided', () => {
      delete process.env.VOICE_MEMO_JOB_INTERVAL_MINUTES;
      delete process.env.MAX_RETRIES;

      const service = new ConfigService();
      const env = service.getEnv();

      expect(env.VOICE_MEMO_JOB_INTERVAL_MINUTES).toBe('5');
      expect(env.MAX_RETRIES).toBe('3');
    });

    it('should throw error when required environment variables are missing', () => {
      delete process.env.GEMINI_API_KEY;

      expect(() => new ConfigService()).toThrow('Missing required environment variables');
    });
  });

  describe('initialize', () => {
    it('should fetch schema when databases exist', async () => {
      mockNotion.databases.retrieve.mockImplementation(({ database_id }: any) => {
        if (database_id === 'test_todo_db_id') {
          return {
            properties: {
              priority: {
                select: {
                  options: [
                    { name: 'asap', color: 'red' },
                    { name: 'soon', color: 'yellow' },
                  ],
                },
              },
            },
          };
        }
        return {
          properties: {
            category: {
              select: {
                options: [
                  { name: 'project idea', color: 'purple' },
                  { name: 'general', color: 'gray' },
                ],
              },
            },
          },
        };
      });

      await configService.initialize();
      const schema = configService.getSchema();

      expect(schema.todoDatabaseId).toBe('test_todo_db_id');
      expect(schema.notesDatabaseId).toBe('test_notes_db_id');
      expect(schema.priorities).toEqual(['asap', 'soon']);
      expect(schema.categories).toEqual(['project idea', 'general']);
    });

    it('should create databases when IDs are missing', async () => {
      delete process.env.NOTION_TODO_DATABASE_ID;
      delete process.env.NOTION_NOTES_DATABASE_ID;

      const mockTodoDb = { id: 'new_todo_db_id' };
      const mockNotesDb = { id: 'new_notes_db_id' };

      mockNotion.databases.create
        .mockResolvedValueOnce(mockTodoDb)
        .mockResolvedValueOnce(mockNotesDb);

      mockNotion.databases.retrieve.mockImplementation(({ database_id }: any) => {
        if (database_id === 'new_todo_db_id') {
          return {
            properties: {
              priority: {
                select: {
                  options: [{ name: 'asap', color: 'red' }],
                },
              },
            },
          };
        }
        return {
          properties: {
            category: {
              select: {
                options: [{ name: 'general', color: 'gray' }],
              },
            },
          },
        };
      });

      vi.mocked(readFileSync).mockReturnValue('');
      vi.mocked(writeFileSync).mockImplementation(() => {});

      const service = new ConfigService();
      await service.initialize();

      expect(mockNotion.databases.create).toHaveBeenCalledTimes(2);
      expect(mockNotion.databases.retrieve).toHaveBeenCalledTimes(2);

      const schema = service.getSchema();
      expect(schema.todoDatabaseId).toBe('new_todo_db_id');
      expect(schema.notesDatabaseId).toBe('new_notes_db_id');
    });
  });

  describe('getSchema', () => {
    it('should throw error when schema not initialized', () => {
      expect(() => configService.getSchema()).toThrow('Schema not initialized');
    });
  });

  describe('refreshSchema', () => {
    it('should fetch schema from Notion API', async () => {
      mockNotion.databases.retrieve.mockResolvedValue({
        properties: {
          priority: { select: { options: [{ name: 'asap', color: 'red' }] } },
          category: { select: { options: [{ name: 'general', color: 'gray' }] } },
        },
      });

      await configService.initialize();
      await configService.refreshSchema();

      const schema = configService.getSchema();
      expect(schema.priorities).toEqual(['asap']);
    });
  });
});
