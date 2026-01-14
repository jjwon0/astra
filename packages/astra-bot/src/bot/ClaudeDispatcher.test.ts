import { describe, it, expect } from 'vitest';
import { ClaudeDispatcher } from './ClaudeDispatcher';

describe('ClaudeDispatcher', () => {
  describe('parseDiscordReply', () => {
    it('should extract DISCORD_REPLY from output', () => {
      const dispatcher = new ClaudeDispatcher('/tmp');
      // Access private method for testing via type assertion
      const parseDiscordReply = (dispatcher as any).parseDiscordReply.bind(dispatcher);

      const output = `
Some processing output here...
Tool calls and such...

DISCORD_REPLY: Created TODO "Buy groceries" with priority asap.
`;
      const result = parseDiscordReply(output);
      expect(result).toBe('Created TODO "Buy groceries" with priority asap.');
    });

    it('should handle multiple DISCORD_REPLY markers (use last one)', () => {
      const dispatcher = new ClaudeDispatcher('/tmp');
      const parseDiscordReply = (dispatcher as any).parseDiscordReply.bind(dispatcher);

      const output = `
DISCORD_REPLY: First attempt
More processing...
DISCORD_REPLY: Final response here.
`;
      const result = parseDiscordReply(output);
      expect(result).toBe('Final response here.');
    });

    it('should fallback to last line if no marker found', () => {
      const dispatcher = new ClaudeDispatcher('/tmp');
      const parseDiscordReply = (dispatcher as any).parseDiscordReply.bind(dispatcher);

      const output = `
Processing complete.
All items synced.
Done successfully.
`;
      const result = parseDiscordReply(output);
      expect(result).toBe('Done successfully.');
    });

    it('should return Done if output is empty', () => {
      const dispatcher = new ClaudeDispatcher('/tmp');
      const parseDiscordReply = (dispatcher as any).parseDiscordReply.bind(dispatcher);

      const result = parseDiscordReply('');
      expect(result).toBe('Done.');
    });

    it('should truncate long responses', () => {
      const dispatcher = new ClaudeDispatcher('/tmp');
      const parseDiscordReply = (dispatcher as any).parseDiscordReply.bind(dispatcher);

      const longLine = 'A'.repeat(600);
      const output = longLine;
      const result = parseDiscordReply(output);
      expect(result.length).toBeLessThanOrEqual(500);
      expect(result).toContain('...');
    });
  });
});
