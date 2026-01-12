import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganizationService } from './organization';
import { NotionSchema } from '../config';
import { Logger } from '../../utils/logger';

describe('OrganizationService', () => {
  let organizationService: OrganizationService;
  let logger: Logger;
  let mockSchema: NotionSchema;

  beforeEach(() => {
    organizationService = new OrganizationService('test-api-key', 3);
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

    global.fetch = vi.fn() as any;
  });

  it('should return organized items on success', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"items":[{"type":"TODO","title":"Buy milk","description":"Get 2% milk","priority":"asap","category":"general"}]}',
                },
              ],
            },
          },
        ],
      }),
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await organizationService.organize(
      'TODO: buy milk. Get 2% milk',
      mockSchema,
      logger
    );

    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('TODO');
    expect(result.items[0].title).toBe('Buy milk');
    expect(result.items[0].description).toBe('TODO: buy milk. Get 2% milk');
    expect(logger.info).toHaveBeenCalledWith('Organizing transcript (attempt 1/3)');
  });

  it('should handle multiple items', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"items":[{"type":"TODO","title":"Buy milk","priority":"asap"},{"type":"NOTE","title":"Remember RSC","category":"research item"}]}',
                },
              ],
            },
          },
        ],
      }),
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await organizationService.organize(
      'TODO: buy milk. Remember RSC',
      mockSchema,
      logger
    );

    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].type).toBe('TODO');
    expect(result.items[1].type).toBe('NOTE');
  });

  it('should retry on API error', async () => {
    let attemptCount = 0;

    (global.fetch as any).mockImplementation(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        };
      }
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '{"items":[]}' }],
              },
            },
          ],
        }),
      };
    });

    const result = await organizationService.organize('test', mockSchema, logger);

    expect(result.success).toBe(true);
    expect(attemptCount).toBe(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('should return error after max retries', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await organizationService.organize('test', mockSchema, logger);

    expect(result.success).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.error).toBeDefined();
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Organization failed after 3 attempts')
    );
  }, 15000);

  it('should handle invalid JSON response', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'not valid json' }],
            },
          },
        ],
      }),
    });

    const result = await organizationService.organize('test', mockSchema, logger);

    expect(result.success).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON response'));
  }, 10000);

  it('should clean markdown code blocks from response', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '```json\n{"items":[{"type":"TODO","title":"test","priority":"asap"}]}\n```',
                },
              ],
            },
          },
        ],
      }),
    });

    const result = await organizationService.organize('test', mockSchema, logger);

    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('test');
  });

  it('should handle missing text from API', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [],
      }),
    });

    const result = await organizationService.organize('test', mockSchema, logger);

    expect(result.success).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No text returned'));
  });
});
