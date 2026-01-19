import { EventEmitter } from 'events';
import chokidar, { WatchEvent } from 'chokidar';
import { 
  access, 
  constants, 
  copyFile, 
  mkdir, 
  stat, 
  readdir,
  writeFile
} from 'fs/promises';
import { 
  homedir, 
  platform 
} from 'os';
import { 
  join, 
  basename, 
  dirname 
} from 'path';

interface WatcherConfig {
  sourceDir: string;
  destDir: string;
  logFile: string;
  checkInterval: number;
  maxRetries: number;
  retryDelay: number;
  processDelay: number;
}

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export class VoiceMemoWatcher extends EventEmitter {
  private config: WatcherConfig;
  private watcher: chokidar.FSWatcher | null = null;
  private isRunning = false;
  private processedFiles = new Set<string>();
  private logBuffer: LogEntry[] = [];

  constructor(config: Partial<WatcherConfig> = {}) {
    super();
    
    this.config = {
      sourceDir: this.expandTilde('~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings'),
      destDir: this.expandTilde('~/.astra/voice-memo-inbox'),
      logFile: this.expandTilde('~/.astra/watcher.log'),
      checkInterval: 5000, // 5 seconds
      maxRetries: 3,
      retryDelay: 1000, // 1 second
      processDelay: 2000, // 2 seconds
      ...config
    };
  }

  private expandTilde(path: string): string {
    if (path.startsWith('~/')) {
      return join(homedir(), path.slice(2));
    }
    return path;
  }

  private async log(level: LogEntry['level'], message: string): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    this.logBuffer.push(entry);
    
    // Keep only last 100 log entries in memory
    if (this.logBuffer.length > 100) {
      this.logBuffer.shift();
    }

    // Write to file
    try {
      await writeFile(
        this.config.logFile, 
        `[${entry.timestamp}] ${level}: ${message}\n`, 
        { flag: 'a' }
      );
    } catch (error) {
      console.error('Failed to write log:', error);
    }

    // Console output
    const color = level === 'ERROR' ? '\x1b[31m' : 
                  level === 'WARN' ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}[${entry.timestamp}] ${level}: ${message}\x1b[0m`);
  }

  private isAudioFile(filename: string): boolean {
    const ext = basename(filename).toLowerCase().split('.').pop();
    return ['m4a', 'caf', 'aac', 'mp3', 'wav'].includes(ext || '');
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await mkdir(dirname(this.config.logFile), { recursive: true });
      await mkdir(this.config.destDir, { recursive: true });
    } catch (error) {
      await this.log('ERROR', `Failed to create directories: ${error}`);
      throw error;
    }
  }

  private async checkSourceDir(): Promise<void> {
    try {
      await access(this.config.sourceDir, constants.F_OK);
    } catch (error) {
      await this.log('ERROR', `Source directory does not exist: ${this.config.sourceDir}`);
      throw new Error(`Source directory not accessible: ${this.config.sourceDir}`);
    }
  }

  private async copyFileWithRetry(filename: string): Promise<boolean> {
    const sourcePath = join(this.config.sourceDir, filename);
    const destPath = join(this.config.destDir, filename);

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Check if file is being written (size < 1KB)
        const fileStats = await stat(sourcePath);
        if (fileStats.size < 1024) {
          if (attempt < this.config.maxRetries) {
            await this.log('WARN', `File ${filename} too small (${fileStats.size} bytes), attempt ${attempt}/${this.config.maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
            continue;
          }
        }

        await copyFile(sourcePath, destPath);
        await this.log('INFO', `Successfully copied: ${filename}`);
        return true;
      } catch (error) {
        await this.log('ERROR', `Attempt ${attempt} failed for ${filename}: ${error}`);
        
        if (attempt < this.config.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    await this.log('ERROR', `Failed to copy ${filename} after ${this.config.maxRetries} attempts`);
    return false;
  }

  private async processExistingFiles(): Promise<void> {
    try {
      await this.log('INFO', 'Processing existing files...');
      
      const files = await readdir(this.config.sourceDir);
      
      for (const filename of files) {
        if (this.isAudioFile(filename) && !this.processedFiles.has(filename)) {
          const destPath = join(this.config.destDir, filename);
          
          // Check if already exists in destination
          try {
            await access(destPath, constants.F_OK);
            continue; // File already copied
          } catch {
            // File doesn't exist in destination, copy it
            await this.log('INFO', `Found existing file: ${filename}`);
            await this.copyFileWithRetry(filename);
            this.processedFiles.add(filename);
          }
        }
      }
    } catch (error) {
      await this.log('ERROR', `Failed to process existing files: ${error}`);
    }
  }

  private async handleFileCreate(filePath: string): Promise<void> {
    const filename = basename(filePath);
    
    if (!this.isAudioFile(filename) || this.processedFiles.has(filename)) {
      return;
    }

    await this.log('INFO', `New file detected: ${filename}`);
    
    // Wait for file to be fully written
    await new Promise(resolve => setTimeout(resolve, this.config.processDelay));
    
    const success = await this.copyFileWithRetry(filename);
    if (success) {
      this.processedFiles.add(filename);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      await this.log('WARN', 'Watcher is already running');
      return;
    }

    try {
      await this.ensureDirectories();
      await this.checkSourceDir();
      
      await this.log('INFO', 'Voice Memo Watcher starting...');
      await this.log('INFO', `Source: ${this.config.sourceDir}`);
      await this.log('INFO', `Destination: ${this.config.destDir}`);
      await this.log('INFO', `Log: ${this.config.logFile}`);

      // Process existing files first
      await this.processExistingFiles();

      // Set up file watcher
      this.watcher = chokidar.watch(this.config.sourceDir, {
        ignored: /^\./, // Ignore hidden files
        persistent: true,
        ignoreInitial: true
      });

      this.watcher.on('add', async (filePath) => {
        await this.handleFileCreate(filePath);
      });

      this.watcher.on('error', async (error) => {
        await this.log('ERROR', `Watcher error: ${error}`);
      });

      this.isRunning = true;
      await this.log('INFO', 'Watcher started successfully');
      
      // Emit ready event
      this.emit('ready');
      
    } catch (error) {
      await this.log('ERROR', `Failed to start watcher: ${error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    await this.log('INFO', 'Stopping watcher...');
    
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isRunning = false;
    await this.log('INFO', 'Watcher stopped');
  }

  getStatus(): { isRunning: boolean; processedFiles: number } {
    return {
      isRunning: this.isRunning,
      processedFiles: this.processedFiles.size
    };
  }

  getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }
}

// CLI Interface
async function main(): Promise<void> {
  const watcher = new VoiceMemoWatcher();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down...');
    await watcher.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...');
    await watcher.stop();
    process.exit(0);
  });

  try {
    await watcher.start();
    
    // Keep process running
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      await watcher.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      await watcher.stop();
      process.exit(1);
    });

    // Log status every hour
    setInterval(async () => {
      const status = watcher.getStatus();
      await watcher.log('INFO', `Status: ${status.processedFiles} files processed`);
    }, 3600000); // 1 hour

  } catch (error) {
    console.error('Failed to start watcher:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}