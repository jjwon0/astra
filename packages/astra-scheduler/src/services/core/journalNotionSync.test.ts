import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JournalNotionService } from './journalNotionSync';
import { Logger } from '../../utils/logger';

const mockQuery = vi.fn();
const mockCreate = vi.fn();
const mockAppend = vi.fn();

vi.mock('@notionhq/client', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      databases: {
        query: mockQuery,
      },
      pages: {
        create: mockCreate,
      },
      blocks: {
        children: {
          append: mockAppend,
        },
      },
    })),
  };
});

describe('JournalNotionService', () => {
  let journalNotionService: JournalNotionService;
  let logger: Logger;
  const testDate = new Date('2026-01-10T14:30:00');

  beforeEach(() => {
    mockQuery.mockClear();
    mockCreate.mockClear();
    mockAppend.mockClear();

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    journalNotionService = new JournalNotionService('test-api-key', 'journal-db-123', 3);
  });

  describe('syncEntry', () => {
    it('should create new page when no page exists for today', async () => {
      mockQuery.mockResolvedValue({ results: [] });
      mockCreate.mockResolvedValue({ id: 'new-page-123' });

      const result = await journalNotionService.syncEntry(
        'This is my journal entry for today.',
        testDate,
        logger
      );

      expect(result.success).toBe(true);
      expect(result.pageId).toBe('new-page-123');
      expect(result.isNewPage).toBe(true);

      expect(mockQuery).toHaveBeenCalledWith({
        database_id: 'journal-db-123',
        filter: {
          property: 'date',
          date: { equals: '2026-01-10' },
        },
      });

      expect(mockCreate).toHaveBeenCalledWith({
        parent: { database_id: 'journal-db-123' },
        properties: {
          title: { title: [{ text: { content: 'January 10, 2026' } }] },
          date: { date: { start: '2026-01-10' } },
          processed: { checkbox: false },
        },
        children: expect.arrayContaining([
          expect.objectContaining({ type: 'heading_3' }),
          expect.objectContaining({ type: 'paragraph' }),
        ]),
      });
    });

    it('should append to existing page when page exists for today', async () => {
      mockQuery.mockResolvedValue({ results: [{ id: 'existing-page-456' }] });
      mockAppend.mockResolvedValue({});

      const result = await journalNotionService.syncEntry(
        'Another entry for today.',
        testDate,
        logger
      );

      expect(result.success).toBe(true);
      expect(result.pageId).toBe('existing-page-456');
      expect(result.isNewPage).toBe(false);

      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockAppend).toHaveBeenCalledWith({
        block_id: 'existing-page-456',
        children: expect.arrayContaining([
          expect.objectContaining({ type: 'divider' }),
          expect.objectContaining({ type: 'heading_3' }),
          expect.objectContaining({ type: 'paragraph' }),
        ]),
      });
    });

    it('should include divider when appending but not when creating', async () => {
      // Test creating new page (no divider)
      mockQuery.mockResolvedValue({ results: [] });
      mockCreate.mockResolvedValue({ id: 'new-page' });

      await journalNotionService.syncEntry('First entry', testDate, logger);

      const createChildren = mockCreate.mock.calls[0][0].children;
      expect(createChildren[0].type).not.toBe('divider');
      expect(createChildren[0].type).toBe('heading_3');

      // Test appending (has divider)
      mockQuery.mockResolvedValue({ results: [{ id: 'existing-page' }] });
      mockAppend.mockResolvedValue({});

      await journalNotionService.syncEntry('Second entry', testDate, logger);

      const appendChildren = mockAppend.mock.calls[0][0].children;
      expect(appendChildren[0].type).toBe('divider');
    });

    it('should format timestamp correctly', async () => {
      mockQuery.mockResolvedValue({ results: [] });
      mockCreate.mockResolvedValue({ id: 'page-123' });

      await journalNotionService.syncEntry('Entry', testDate, logger);

      const children = mockCreate.mock.calls[0][0].children;
      const heading = children.find((c: any) => c.type === 'heading_3');
      expect(heading.heading_3.rich_text[0].text.content).toBe('2:30 PM');
    });

    it('should split long text into multiple paragraphs', async () => {
      mockQuery.mockResolvedValue({ results: [] });
      mockCreate.mockResolvedValue({ id: 'page-123' });

      const longText = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';

      await journalNotionService.syncEntry(longText, testDate, logger);

      const children = mockCreate.mock.calls[0][0].children;
      const paragraphs = children.filter((c: any) => c.type === 'paragraph');
      expect(paragraphs.length).toBe(3);
    });

    it('should retry on API error', async () => {
      let queryAttempts = 0;
      mockQuery.mockImplementation(async () => {
        queryAttempts++;
        if (queryAttempts < 2) {
          throw new Error('Temporary error');
        }
        return { results: [] };
      });
      mockCreate.mockResolvedValue({ id: 'page-123' });

      const result = await journalNotionService.syncEntry('Entry', testDate, logger);

      expect(result.success).toBe(true);
      expect(queryAttempts).toBe(2);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should return error after max retries', async () => {
      mockQuery.mockRejectedValue(new Error('Persistent error'));

      const result = await journalNotionService.syncEntry('Entry', testDate, logger);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Persistent error');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Journal sync failed after 3 attempts')
      );
    }, 15000);

    it('should handle page creation failure', async () => {
      mockQuery.mockResolvedValue({ results: [] });
      mockCreate.mockRejectedValue(new Error('Create failed'));

      const result = await journalNotionService.syncEntry('Entry', testDate, logger);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Create failed');
    }, 15000);

    it('should handle append failure', async () => {
      mockQuery.mockResolvedValue({ results: [{ id: 'existing-page' }] });
      mockAppend.mockRejectedValue(new Error('Append failed'));

      const result = await journalNotionService.syncEntry('Entry', testDate, logger);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Append failed');
    }, 15000);
  });
});
