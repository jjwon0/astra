import { mkdirSync, appendFileSync, statSync, renameSync, existsSync } from 'fs';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export class Logger {
  private logFile: string;
  private currentSize: number = 0;
  private maxLogSize: number;

  constructor(logFile: string, maxLogSizeMB: number = 10) {
    this.logFile = logFile;
    this.maxLogSize = maxLogSizeMB * 1024 * 1024;
    this.ensureLogDirectory();

    try {
      const stats = statSync(logFile);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }
  }

  private ensureLogDirectory(): void {
    const dir = this.logFile.substring(0, this.logFile.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    return `${timestamp} [${level}] ${message}\n`;
  }

  private rotateLog(): void {
    let rotationNumber = 1;

    while (rotationNumber < 1000) {
      const rotatedFile = `${this.logFile}.${rotationNumber}`;

      try {
        const stats = statSync(rotatedFile);
        if (stats.size < this.maxLogSize) {
          break;
        }
      } catch {
        break;
      }

      rotationNumber++;
      const nextFile = `${this.logFile}.${rotationNumber + 1}`;
      try {
        renameSync(rotatedFile, nextFile);
      } catch {
        break;
      }
    }

    renameSync(this.logFile, `${this.logFile}.1`);
    this.currentSize = 0;
  }

  private write(level: LogLevel, message: string): void {
    const logLine = this.formatMessage(level, message);
    appendFileSync(this.logFile, logLine);
    this.currentSize += logLine.length;

    if (this.currentSize > this.maxLogSize) {
      this.rotateLog();
    }
  }

  info(message: string): void {
    this.write('INFO', message);
  }

  warn(message: string): void {
    this.write('WARN', message);
  }

  error(message: string): void {
    this.write('ERROR', message);
  }
}
