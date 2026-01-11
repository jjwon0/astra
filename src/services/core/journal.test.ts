import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JournalService } from './journal';
import { Logger } from '../../utils/logger';

describe('JournalService', () => {
  let journalService: JournalService;
  let logger: Logger;

  beforeEach(() => {
    journalService = new JournalService('test-api-key', 3);
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    global.fetch = vi.fn() as any;
  });

  it('should return formatted text on success', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Today I had a great morning meeting with the team. We discussed the upcoming sprint.',
                },
              ],
            },
          },
        ],
      }),
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await journalService.format(
      'Today I had a, um, great morning meeting with the team. We, like, discussed the upcoming sprint.',
      logger
    );

    expect(result.success).toBe(true);
    expect(result.formattedText).toBe(
      'Today I had a great morning meeting with the team. We discussed the upcoming sprint.'
    );
    expect(logger.info).toHaveBeenCalledWith('Formatting journal entry (attempt 1/3)');
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
                parts: [{ text: 'Formatted text' }],
              },
            },
          ],
        }),
      };
    });

    const result = await journalService.format('test transcript', logger);

    expect(result.success).toBe(true);
    expect(result.formattedText).toBe('Formatted text');
    expect(attemptCount).toBe(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('should return error after max retries', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await journalService.format('test transcript', logger);

    expect(result.success).toBe(false);
    expect(result.formattedText).toBe('');
    expect(result.error).toBeDefined();
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Journal formatting failed after 3 attempts')
    );
  }, 15000);

  it('should handle missing text from API', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [],
      }),
    });

    const result = await journalService.format('test transcript', logger);

    expect(result.success).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No text returned'));
  });

  it('should trim whitespace from response', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '  Formatted text with whitespace  \n\n' }],
            },
          },
        ],
      }),
    });

    const result = await journalService.format('test', logger);

    expect(result.success).toBe(true);
    expect(result.formattedText).toBe('Formatted text with whitespace');
  });

  it('should handle network errors', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const result = await journalService.format('test', logger);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  }, 15000);
});
