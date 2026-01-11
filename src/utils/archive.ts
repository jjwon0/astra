import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export class ArchiveService {
  private archiveDir: string;
  private failedDir: string;
  private invalidDir: string;

  constructor(archiveDir: string, failedDir: string, invalidDir: string) {
    this.archiveDir = archiveDir;
    this.failedDir = failedDir;
    this.invalidDir = invalidDir;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.archiveDir)) {
      mkdirSync(this.archiveDir, { recursive: true });
    }

    if (!existsSync(this.failedDir)) {
      mkdirSync(this.failedDir, { recursive: true });
    }

    if (!existsSync(this.invalidDir)) {
      mkdirSync(this.invalidDir, { recursive: true });
    }
  }

  archive(filePath: string): string {
    const filename = filePath.split('/').pop() || filePath;
    const archivePath = join(this.archiveDir, filename);

    mkdirSync(dirname(archivePath), { recursive: true });
    copyFileSync(filePath, archivePath);

    return archivePath;
  }

  archiveFailed(filePath: string): string {
    const filename = filePath.split('/').pop() || filePath;
    const failedPath = join(this.failedDir, filename);

    mkdirSync(dirname(failedPath), { recursive: true });
    copyFileSync(filePath, failedPath);

    return failedPath;
  }

  archiveInvalid(filePath: string): string {
    const filename = filePath.split('/').pop() || filePath;
    const invalidPath = join(this.invalidDir, filename);

    mkdirSync(dirname(invalidPath), { recursive: true });
    copyFileSync(filePath, invalidPath);

    return invalidPath;
  }
}
