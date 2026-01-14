import { Client, Events, GatewayIntentBits, Message, Partials } from 'discord.js';
import { ClaudeDispatcher } from './ClaudeDispatcher';

export interface BotConfig {
  token: string;
  channelId?: string;
  allowedUsers?: string[];
  workingDir?: string;
}

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  channelId: string;
  messages: ConversationEntry[];
  lastActivity: number;
}

export class DiscordBot {
  private client: Client;
  private dispatcher: ClaudeDispatcher;
  private config: BotConfig;
  private processedMessages: Set<string> = new Set();
  private conversations: Map<string, Conversation> = new Map();
  private readonly CONVERSATION_TTL_MS = 3600000; // 1 hour
  private readonly MAX_HISTORY_MESSAGES = 10;

  constructor(config: BotConfig) {
    this.config = config;
    this.dispatcher = new ClaudeDispatcher(config.workingDir);

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel], // Required for DMs
    });

    this.setupEventHandlers();

    // Clean up old conversations periodically
    setInterval(() => this.cleanupConversations(), 300000); // Every 5 minutes
  }

  private getConversationKey(message: Message): string {
    // Use channel ID as the conversation key (one conversation per channel)
    return message.channel.id;
  }

  private getConversation(message: Message): Conversation {
    const key = this.getConversationKey(message);
    let conv = this.conversations.get(key);
    if (!conv) {
      conv = {
        channelId: message.channel.id,
        messages: [],
        lastActivity: Date.now(),
      };
      this.conversations.set(key, conv);
    }
    return conv;
  }

  private cleanupConversations(): void {
    const now = Date.now();
    for (const [key, conv] of this.conversations.entries()) {
      if (now - conv.lastActivity > this.CONVERSATION_TTL_MS) {
        this.conversations.delete(key);
      }
    }
  }

  private formatHistory(conv: Conversation): string {
    if (conv.messages.length === 0) return '';
    const recent = conv.messages.slice(-this.MAX_HISTORY_MESSAGES);
    return recent
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, (c) => {
      console.log(`Bot ready! Logged in as ${c.user.tag}`);
      console.log(`Listening for: @mentions, DMs${this.config.channelId ? `, channel ${this.config.channelId}` : ''}`);
    });

    this.client.on(Events.MessageCreate, async (message) => {
      await this.handleMessage(message);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages (prevents loops)
    if (message.author.bot) return;

    // Check if already processed (prevents reprocessing)
    if (this.processedMessages.has(message.id)) return;

    // Check if this is an allowed context
    if (!this.isAllowedContext(message)) {
      console.log(`Ignoring message (not allowed context): "${message.content.slice(0, 50)}..."`);
      return;
    }

    console.log(`Processing message from ${message.author.tag}: "${message.content.slice(0, 100)}..."`);

    // Check if user is allowed (if restriction is set)
    if (
      this.config.allowedUsers &&
      this.config.allowedUsers.length > 0 &&
      !this.config.allowedUsers.includes(message.author.id)
    ) {
      return;
    }

    // Mark as processed immediately to prevent loops
    this.processedMessages.add(message.id);

    try {
      // Show typing indicator
      await message.channel.sendTyping();

      // Strip @mention from message content
      let content = message.content;
      if (this.client.user) {
        content = content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
      }

      // Get conversation history
      const conv = this.getConversation(message);
      const history = this.formatHistory(conv);

      // Build prompt with history
      const fullPrompt = history
        ? `Previous conversation:\n${history}\n\nUser's new message: ${content}`
        : content;

      // Dispatch to Claude
      console.log(`Dispatching to Claude: "${content.slice(0, 100)}..."`);
      const result = await this.dispatcher.dispatch(fullPrompt);
      console.log(`Dispatch result: success=${result.success}, reply="${result.discordReply.slice(0, 100)}..."`);

      // Send response
      await this.sendResponse(message, result.discordReply);

      // Update conversation with this exchange
      conv.messages.push({ role: 'user', content, timestamp: Date.now() });
      conv.messages.push({ role: 'assistant', content: result.discordReply, timestamp: Date.now() });
      conv.lastActivity = Date.now();

      // Log if there was an error
      if (!result.success) {
        console.error('Claude dispatch error:', result.error);
        console.error('Full output:', result.fullOutput);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      await this.sendResponse(message, 'Sorry, something went wrong.');
    }
  }

  private isAllowedContext(message: Message): boolean {
    // Allow DMs
    if (!message.guild) return true;

    // Allow @mentions of the bot
    if (this.client.user && message.mentions.has(this.client.user)) {
      return true;
    }

    // If channel ID is set, respond to all messages in that channel
    if (this.config.channelId) {
      return message.channel.id === this.config.channelId;
    }

    return false;
  }

  private async sendResponse(message: Message, content: string): Promise<void> {
    let sentMessage: Message | null = null;

    // Discord has a 2000 character limit
    if (content.length <= 2000) {
      sentMessage = await message.reply(content);
    } else {
      // Split into chunks
      const chunks = this.splitMessage(content);
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          sentMessage = await message.reply(chunks[i]);
        } else {
          await message.channel.send(chunks[i]);
        }
      }
    }

    // Create a thread for conversation continuity
    if (sentMessage) {
      try {
        // Generate thread name from first few words of user's message
        const threadName = message.content.slice(0, 100).replace(/<@\d+>/g, '').trim();
        await sentMessage.startThread({
          name: threadName || 'conversation',
          autoArchiveDuration: 1440, // 24 hours
        });
        console.log(`Created thread for message`);
      } catch (error) {
        // Thread might already exist or not be supported (e.g., in DMs)
        console.log(`Could not create thread: ${error}`);
      }
    }
  }

  private splitMessage(content: string, maxLength: number = 2000): string[] {
    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a newline
      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        // Try to split at a space
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        // Force split
        splitIndex = maxLength;
      }

      chunks.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks;
  }

  async start(): Promise<void> {
    await this.client.login(this.config.token);
  }

  async stop(): Promise<void> {
    this.client.destroy();
  }
}
