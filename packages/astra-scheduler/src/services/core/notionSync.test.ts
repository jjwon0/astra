import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotionSyncService } from './notionSync';
import { NotionSchema } from '../config';
import { Logger } from '../../utils/logger';

const mockCreate = vi.fn();

vi.mock('@notionhq/client', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      pages: {
        create: mockCreate,
      },
    })),
  };
});

describe('NotionSyncService', () => {
  let notionSyncService: NotionSyncService;
  let logger: Logger;
  let mockSchema: NotionSchema;
  const testRecordedAt = new Date('2026-01-10T14:30:00');

  beforeEach(() => {
    mockCreate.mockClear();

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockSchema = {
      todoDatabaseId: 'todo-db-123',
      notesDatabaseId: 'notes-db-456',
      priorities: ['asap', 'soon', 'eventually'],
      categories: ['project idea', 'feature idea', 'research item', 'general'],
    };

    notionSyncService = new NotionSyncService('test-api-key', mockSchema, 3);
    mockCreate.mockResolvedValue({ id: 'page-123' });
  });

  it('should create TODO items in Notion', async () => {
    const items = [
      {
        type: 'TODO' as const,
        title: 'Buy milk',
        description: 'Get 2% milk',
        priority: 'asap' as const,
        category: 'general',
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(1);
    expect(result.itemsFailed).toBe(0);
    expect(result.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith({
      parent: { database_id: 'todo-db-123' },
      properties: {
        title: { title: [{ text: { content: 'Buy milk' } }] },
        description: { rich_text: [{ text: { content: 'Get 2% milk' } }] },
        priority: { select: { name: 'asap' } },
        done: { checkbox: false },
        created_date: { date: { start: expect.any(String) } },
        source: { rich_text: [{ text: { content: 'voice_memo.m4a' } }] },
      },
    });
    expect(logger.info).toHaveBeenCalledWith('Syncing 1 item(s) to Notion');
    expect(logger.info).toHaveBeenCalledWith('Created TODO: Buy milk');
  });

  it('should create NOTE items in Notion', async () => {
    const items = [
      {
        type: 'NOTE' as const,
        title: 'Research RSC',
        content: 'React Server Components are cool',
        priority: 'eventually' as const,
        category: 'research item',
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(1);
    expect(result.itemsFailed).toBe(0);
    expect(result.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith({
      parent: { database_id: 'notes-db-456' },
      properties: {
        title: { title: [{ text: { content: 'Research RSC' } }] },
        content: { rich_text: [{ text: { content: 'React Server Components are cool' } }] },
        category: { select: { name: 'research item' } },
        created_date: { date: { start: expect.any(String) } },
        source: { rich_text: [{ text: { content: 'voice_memo.m4a' } }] },
      },
    });
    expect(logger.info).toHaveBeenCalledWith('Created NOTE: Research RSC');
  });

  it('should handle multiple items', async () => {
    const items = [
      {
        type: 'TODO' as const,
        title: 'Task 1',
        priority: 'asap' as const,
        category: 'general',
      },
      {
        type: 'NOTE' as const,
        title: 'Note 1',
        content: 'Note content',
        priority: 'eventually' as const,
        category: 'general',
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(2);
    expect(result.itemsFailed).toBe(0);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('should skip items with invalid priority', async () => {
    const items = [
      {
        type: 'TODO' as const,
        title: 'Invalid task',
        priority: 'invalid_priority' as any,
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(0);
    expect(result.itemsFailed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.success).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid priority'));
  });

  it('should skip items with invalid category', async () => {
    const items = [
      {
        type: 'NOTE' as const,
        title: 'Invalid note',
        content: 'content',
        priority: 'eventually' as const,
        category: 'invalid_category',
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(0);
    expect(result.itemsFailed).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid category'));
  });

  it('should handle API errors', async () => {
    mockCreate.mockRejectedValue(new Error('API Error'));

    const items = [
      {
        type: 'TODO' as const,
        title: 'Failed task',
        priority: 'asap' as const,
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(0);
    expect(result.itemsFailed).toBe(1);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to sync item'));
  }, 10000);

  it('should retry on API failure', async () => {
    let attemptCount = 0;
    mockCreate.mockImplementation(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Temporary error');
      }
      return { id: 'page-123' };
    });

    const items = [
      {
        type: 'TODO' as const,
        title: 'Retry task',
        priority: 'asap' as const,
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(1);
    expect(result.itemsFailed).toBe(0);
    expect(attemptCount).toBe(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  }, 10000);

  it('should handle partial success', async () => {
    let callCount = 0;
    mockCreate.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { id: 'page-1' };
      }
      throw new Error('Failed');
    });

    const items = [
      {
        type: 'TODO' as const,
        title: 'Success task',
        priority: 'asap' as const,
      },
      {
        type: 'TODO' as const,
        title: 'Failed task',
        priority: 'soon' as const,
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(1);
    expect(result.itemsFailed).toBe(1);
    expect(result.success).toBe(false);
  }, 10000);

  it('should handle items with missing optional fields', async () => {
    const items = [
      {
        type: 'TODO' as const,
        title: 'Minimal task',
        priority: 'asap' as const,
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(1);
    const callArgs = mockCreate.mock.calls[0];
    expect(callArgs[0].properties.description.rich_text).toEqual([]);
  });

  it('should default to "general" category if not provided', async () => {
    const items = [
      {
        type: 'NOTE' as const,
        title: 'Note without category',
        content: 'content',
        priority: 'eventually' as const,
      },
    ];

    const result = await notionSyncService.sync(items, 'voice_memo.m4a', testRecordedAt, logger);

    expect(result.itemsCreated).toBe(1);
    const callArgs = mockCreate.mock.calls[0];
    expect(callArgs[0].properties.category.select.name).toBe('general');
  });
});
