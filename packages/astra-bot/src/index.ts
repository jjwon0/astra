import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { DiscordBot } from './bot/DiscordBot';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root .env
config({ path: resolve(__dirname, '../../../.env') });

function ensureBotDirectory(): void {
  const botDir = resolve(homedir(), '.astra', 'bot');
  const dirs = [botDir, resolve(botDir, 'scratch'), resolve(botDir, 'artifacts')];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }

  // Copy CLAUDE.md template if it doesn't exist
  const claudeMdDest = resolve(botDir, 'CLAUDE.md');
  if (!existsSync(claudeMdDest)) {
    const claudeMdSrc = resolve(__dirname, '../../templates/CLAUDE.md');
    if (existsSync(claudeMdSrc)) {
      copyFileSync(claudeMdSrc, claudeMdDest);
      console.log(`Created ${claudeMdDest} from template`);
    }
  }
}

async function main(): Promise<void> {
  // Validate required env vars
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error('Error: DISCORD_BOT_TOKEN is required');
    process.exit(1);
  }

  // Ensure bot directory and files exist
  ensureBotDirectory();

  // Parse allowed users if set
  const allowedUsersRaw = process.env.DISCORD_ALLOWED_USERS;
  const allowedUsers = allowedUsersRaw
    ? allowedUsersRaw.split(',').map((u) => u.trim()).filter(Boolean)
    : undefined;

  // Create and start bot
  const bot = new DiscordBot({
    token,
    channelId: process.env.DISCORD_CHANNEL_ID,
    allowedUsers,
    workingDir: resolve(homedir(), '.astra', 'bot'),
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await bot.stop();
    process.exit(0);
  });

  try {
    await bot.start();
    console.log('Astra Bot is running!');
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();
