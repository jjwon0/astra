import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileWatcher } from './fileWatcher';
import { StateService } from '../../utils/state';
import { Logger } from '../../utils/logger';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileWatcher', () => {
  const testDir = join(tmpdir(), 'astra-filewatcher-test');
  let stateService: StateService;
  let logger: Logger;

  beforeEach(() => {
    stateService = new StateService(join(testDir, 'state.json'));
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should return empty array when no files exist', async () => {
    const watcher = new FileWatcher(testDir);
    const files = await watcher.watch(stateService, logger);

    expect(files).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith('Scanning directory: ' + testDir);
    expect(logger.info).toHaveBeenCalledWith('Found 0 audio file(s)');
  });

  it('should return all audio files when no files are processed', async () => {
    writeFileSync(join(testDir, 'test1.m4a'), 'audio content');
    writeFileSync(join(testDir, 'test2.wav'), 'audio content');
    writeFileSync(join(testDir, 'readme.txt'), 'text content');

    const watcher = new FileWatcher(testDir);
    const files = await watcher.watch(stateService, logger);

    expect(files).toHaveLength(2);
    expect(files.map((f: string) => f.split('/').pop())).toContain('test1.m4a');
    expect(files.map((f: string) => f.split('/').pop())).toContain('test2.wav');
    expect(logger.info).toHaveBeenCalledWith('Found 2 new file(s) to process');
  });

  it('should filter out already processed files', async () => {
    writeFileSync(join(testDir, 'test1.m4a'), 'audio content');
    writeFileSync(join(testDir, 'test2.m4a'), 'audio content');

    stateService.markJobCompleted('voiceMemoJob', 'test1.m4a');

    const watcher = new FileWatcher(testDir);
    const files = await watcher.watch(stateService, logger);

    expect(files).toHaveLength(1);
    expect(files[0].split('/').pop()).toBe('test2.m4a');
  });

  it('should throw error when directory does not exist', async () => {
    const nonExistentDir = join(testDir, '.non-existent');
    const watcher = new FileWatcher(nonExistentDir);

    await expect(watcher.watch(stateService, logger)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith(`Voice memos directory not found: ${nonExistentDir}`);
  });
});
