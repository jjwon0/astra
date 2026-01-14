import { spawn } from 'child_process';
import { homedir } from 'os';
import { resolve } from 'path';

export interface DispatchResult {
  success: boolean;
  discordReply: string;
  fullOutput: string;
  error?: string;
}

export class ClaudeDispatcher {
  private workingDir: string;
  private timeoutMs: number;

  constructor(workingDir?: string, timeoutMs: number = 120000) {
    this.workingDir = workingDir || resolve(homedir(), '.astra', 'bot');
    this.timeoutMs = timeoutMs;
  }

  async dispatch(userMessage: string): Promise<DispatchResult> {
    return new Promise((resolvePromise) => {
      // Pass message via stdin to avoid interactive TTY issues
      const args = ['--print'];

      console.log(`[ClaudeDispatcher] Spawning: claude ${args.join(' ')} in ${this.workingDir}`);
      console.log(`[ClaudeDispatcher] Working dir exists: ${require('fs').existsSync(this.workingDir)}`);
      console.log(`[ClaudeDispatcher] CLAUDE.md exists: ${require('fs').existsSync(this.workingDir + '/CLAUDE.md')}`);

      const proc = spawn('claude', args, {
        cwd: this.workingDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timeoutFired = false;

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[ClaudeDispatcher] stdout chunk: ${data.toString().slice(0, 200)}`);
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`[ClaudeDispatcher] stderr chunk: ${data.toString().slice(0, 200)}`);
      });

      proc.on('error', (err) => {
        console.log(`[ClaudeDispatcher] spawn error: ${err.message}`);
        clearTimeout(timeout);
        resolvePromise({
          success: false,
          discordReply: 'Failed to run Claude. Is it installed?',
          fullOutput: '',
          error: err.message,
        });
      });

      // Set up timeout first
      const timeout = setTimeout(() => {
        timeoutFired = true;
        console.log(`[ClaudeDispatcher] Timeout fired after ${this.timeoutMs}ms`);
        proc.kill('SIGTERM');
        resolvePromise({
          success: false,
          discordReply: 'Request timed out. Please try again.',
          fullOutput: stdout,
          error: 'Process timed out',
        });
      }, this.timeoutMs);

      // Write message to stdin and close it
      console.log(`[ClaudeDispatcher] Writing to stdin: "${userMessage.slice(0, 100)}..."`);
      proc.stdin.write(userMessage);
      proc.stdin.end();

      proc.on('close', (code) => {
        if (timeoutFired) return; // Already resolved
        clearTimeout(timeout);
        console.log(`[ClaudeDispatcher] Process closed with code ${code}, stdout length: ${stdout.length}, stderr length: ${stderr.length}`);

        if (code !== 0) {
          resolvePromise({
            success: false,
            discordReply: 'Something went wrong. Please try again.',
            fullOutput: stdout,
            error: stderr || `Process exited with code ${code}`,
          });
          return;
        }

        const discordReply = this.parseDiscordReply(stdout);
        console.log(`[ClaudeDispatcher] Parsed reply: "${discordReply.slice(0, 100)}..."`);

        resolvePromise({
          success: true,
          discordReply,
          fullOutput: stdout,
        });
      });
    });
  }

  private parseDiscordReply(output: string): string {
    // Look for DISCORD_REPLY: marker in the output
    const marker = 'DISCORD_REPLY:';
    const markerIndex = output.lastIndexOf(marker);

    if (markerIndex !== -1) {
      // Extract everything after the marker
      const reply = output.slice(markerIndex + marker.length).trim();
      // Take until the next newline or end of string
      const endIndex = reply.indexOf('\n\n');
      return endIndex !== -1 ? reply.slice(0, endIndex).trim() : reply.trim();
    }

    // Fallback: try to extract a meaningful response from the end
    const lines = output.trim().split('\n').filter((l) => l.trim());
    if (lines.length > 0) {
      // Return last non-empty line, truncated if too long
      const lastLine = lines[lines.length - 1];
      return lastLine.length > 500 ? lastLine.slice(0, 497) + '...' : lastLine;
    }

    return 'Done.';
  }
}
