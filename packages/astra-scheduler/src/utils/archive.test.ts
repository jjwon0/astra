import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArchiveService } from './archive';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

vi.mock('fs', () => ({
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('ArchiveService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('archive', () => {
    it('should copy file to archive directory', () => {
      const archiveService = new ArchiveService('/archive', '/failed');

      const archivePath = archiveService.archive('/path/to/file.m4a');

      expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/archive'), {
        recursive: true,
      });
      expect(copyFileSync).toHaveBeenCalledWith('/path/to/file.m4a', archivePath);
    });

    it('should return archive path', () => {
      const archiveService = new ArchiveService('/archive', '/failed');

      const archivePath = archiveService.archive('/path/to/file.m4a');

      expect(archivePath).toBe('/archive/file.m4a');
    });
  });

  describe('archiveFailed', () => {
    it('should copy file to failed directory', () => {
      const archiveService = new ArchiveService('/archive', '/failed');

      const failedPath = archiveService.archiveFailed('/path/to/file.m4a');

      expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/failed'), {
        recursive: true,
      });
      expect(copyFileSync).toHaveBeenCalledWith('/path/to/file.m4a', failedPath);
    });

    it('should return failed path', () => {
      const archiveService = new ArchiveService('/archive', '/failed');

      const failedPath = archiveService.archiveFailed('/path/to/file.m4a');

      expect(failedPath).toBe('/failed/file.m4a');
    });
  });

  describe('ensureDirectories', () => {
    it('should create archive directory if not exists', () => {
      existsSync.mockImplementation((path) => path !== '/archive' && path !== '/failed');

      const archiveService = new ArchiveService('/archive', '/failed');

      expect(mkdirSync).toHaveBeenCalledWith('/archive', { recursive: true });
    });

    it('should create failed directory if not exists', () => {
      existsSync.mockImplementation((path) => path !== '/archive' && path !== '/failed');

      const archiveService = new ArchiveService('/archive', '/failed');

      expect(mkdirSync).toHaveBeenCalledWith('/failed', { recursive: true });
    });
  });

  it('should not create directories that already exist', () => {
    existsSync.mockReturnValue(true);

    const archiveService = new ArchiveService('/archive', '/failed');

    expect(mkdirSync).not.toHaveBeenCalled();
  });
});
