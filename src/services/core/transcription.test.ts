import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscriptionService } from './transcription';
import { Logger } from '../../utils/logger';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

describe('TranscriptionService', () => {
  let transcriptionService: TranscriptionService;
  let logger: Logger;

  beforeEach(() => {
    transcriptionService = new TranscriptionService('test-api-key', 3);
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    global.fetch = vi.fn() as any;
  });

  it('should return transcription text on success', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world, this is a test transcription.' }],
            },
          },
        ],
      }),
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const { readFileSync } = await import('fs');
    (readFileSync as any).mockReturnValue(Buffer.from('audio data'));

    const result = await transcriptionService.transcribe('/path/to/audio.m4a', logger);

    expect(result.success).toBe(true);
    expect(result.text).toBe('Hello world, this is a test transcription.');
    expect(logger.info).toHaveBeenCalledWith('Transcribing /path/to/audio.m4a (attempt 1/3)');
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
                parts: [{ text: 'Success after retry' }],
              },
            },
          ],
        }),
      };
    });

    const { readFileSync } = await import('fs');
    (readFileSync as any).mockReturnValue(Buffer.from('audio data'));

    const result = await transcriptionService.transcribe('/path/to/audio.m4a', logger);

    expect(result.success).toBe(true);
    expect(result.text).toBe('Success after retry');
    expect(attemptCount).toBe(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('should return error after max retries', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const { readFileSync } = await import('fs');
    (readFileSync as any).mockReturnValue(Buffer.from('audio data'));

    const result = await transcriptionService.transcribe('/path/to/audio.m4a', logger);

    expect(result.success).toBe(false);
    expect(result.text).toBe('');
    expect(result.error).toBeDefined();
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Transcription failed after 3 attempts')
    );
  }, 15000);

  it('should use correct mime type for m4a', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'test' }],
            },
          },
        ],
      }),
    });

    const { readFileSync } = await import('fs');
    (readFileSync as any).mockReturnValue(Buffer.from('audio data'));

    await transcriptionService.transcribe('/path/to/audio.m4a', logger);

    const callArgs = (global.fetch as any).mock.calls[0];
    expect(callArgs[0]).toContain('generativelanguage.googleapis.com');
    const body = JSON.parse(callArgs[1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('audio/mp4');
  });

  it('should use correct mime type for wav', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'test' }],
            },
          },
        ],
      }),
    });

    const { readFileSync } = await import('fs');
    (readFileSync as any).mockReturnValue(Buffer.from('audio data'));

    await transcriptionService.transcribe('/path/to/audio.wav', logger);

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('audio/wav');
  });

  it('should handle missing transcription text', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [],
      }),
    });

    const { readFileSync } = await import('fs');
    (readFileSync as any).mockReturnValue(Buffer.from('audio data'));

    const result = await transcriptionService.transcribe('/path/to/audio.m4a', logger);

    expect(result.success).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No transcription text returned')
    );
  });
});
