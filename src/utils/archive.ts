import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export class ArchiveService {
  private archiveDir: string;
  private failedDir: string;

  constructor(archiveDir: string, failedDir: string) {
    this.archiveDir = archiveDir;
    this.failedDir = failedDir;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.archiveDir)) {
      mkdirSync(this.archiveDir, { recursive: true });
    }

    if (!existsSync(this.failedDir)) {
      mkdirSync(this.failedDir, { recursive: true });
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
}
