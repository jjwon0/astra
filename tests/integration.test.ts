import { describe, it, expect, vi } from 'vitest';
import { Logger } from '../src/utils/logger';
import { StateService } from '../src/utils/state';
import { ArchiveService } from '../src/utils/archive';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const TEST_LOG_DIR = join(tmpdir(), 'test-logs');
const TEST_STATE_FILE = join(tmpdir(), 'test-state.json');

describe('Production Infrastructure', () => {
  let logger: Logger;
  let state: StateService;
  let archive: ArchiveService;

  beforeEach(() => {
    logger = new Logger(join(TEST_LOG_DIR, 'production-test.log'), 10);
    state = new StateService(TEST_STATE_FILE);
    archive = new ArchiveService(TEST_ARCHIVE_DIR, TEST_FAILED_DIR);

    mkdirSync(TEST_LOG_DIR, { recursive: true });
    mkdirSync(TEST_ARCHIVE_DIR, { recursive: true });
    mkdirSync(TEST_FAILED_DIR, { recursive: true });
  });

  it('should initialize all services without errors', () => {
    expect(logger).toBeDefined();
    expect(state).toBeDefined();
    expect(archive).toBeDefined();
  });

  it('should allow logging with correct format', () => {
    logger.info('Test info message');
    logger.warn('Test warning');
    logger.error('Test error');

    const logContent = readFileSync(join(TEST_LOG_DIR, 'production-test.log'), 'utf-8');

    expect(logContent).toContain('[INFO] Test info message');
    expect(logContent).toContain('[WARN] Test warning');
    expect(logContent).toContain('[ERROR] Test error');
  });

  it('should allow state management', () => {
    state.saveJobState('testJob', { 'file1.txt': 'completed' });

    const jobState = state.getJobState('testJob');

    expect(jobState).toEqual({ 'file1.txt': 'completed' });
    expect(state.isJobProcessed('testJob', 'file1.txt')).toBe(true);
  });

  it('should allow archiving files', () => {
    const testFile = join(tmpdir(), 'test-file.txt');
    writeFileSync(testFile, 'test content');

    const archivePath = archive.archive(testFile);

    const fileContent = readFileSync(archivePath, 'utf-8');
    expect(fileContent).toBe('test content');
  });
});
