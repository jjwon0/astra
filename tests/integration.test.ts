import { describe, it, vitestExpect as expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../src/utils/logger';
import { StateService } from '../src/utils/state';
import { ArchiveService } from '../src/utils/archive';
import { tmpdir, join } from 'path';
import { readFileSync, mkdirSync, unlinkSync } from 'fs';

const TEST_LOG_DIR = join(tmpdir(), 'test-logs');
const TEST_ARCHIVE_DIR = join(tmpdir(), 'test-archive');
const TEST_FAILED_DIR = join(tmpdir(), 'test-failed');
const TEST_STATE_FILE = join(tmpdir(), 'test-state.json');

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: vi.fn(() => ({ jobs: {} })),
  getJobState: vi.fn(() => ({})),
  saveJobState: vi.fn(),
  isJobProcessed: vi.fn(() => false),
  markJobCompleted: vi.fn(),
  markJobFailed: vi.fn(),
}));

vi.mock('fs', () => ({
  default: vi.fn(() => ({})),
  archive: vi.fn((path) => `archive/${path.split('/').pop()}`),
  archiveFailed: vi.fn((path) => `failed/${path.split('/').pop()}`),
}));

describe('Production Infrastructure', () => {
  let logger: Logger;
  let state: StateService;
  let archive: ArchiveService;

  beforeEach(() => {
    logger = new Logger(join(TEST_LOG_DIR, 'production-test.log'), 10);
    state = new StateService(TEST_STATE_FILE);
    archive = new ArchiveService(TEST_ARCHIVE_DIR, TEST_FAILED_DIR);

    vitest.clearAllMocks();

    mkdirSync(TEST_LOG_DIR, { recursive: true });
    mkdirSync(TEST_ARCHIVE_DIR, { recursive: true });
    mkdirSync(TEST_FAILED_DIR, { recursive: true });
  });

  it('should initialize all services without errors', () => {
    vitestExpect(logger).toBeDefined();
    vitestExpect(state).toBeDefined();
    vitestExpect(archive).toBeDefined();
  });

  it('should allow logging with correct format', () => {
    logger.info('Test info message');
    logger.warn('Test warning');
    logger.error('Test error');

    const logContent = readFileSync(
      join(TEST_LOG_DIR, 'production-test.log'),
      'utf-8'
    );

    vitestExpect(logger.info).toHaveBeenCalled();
    vitestExpect(logger.warn).toHaveBeenCalled();
    vitestExpect(logger.error).toHaveBeenCalled();
    vitestExpect(logContent).toContain('[INFO] Test info message');
    vitestExpect(logContent).toContain('[WARN] Test warning');
    vitestExpect(logContent).toContain('[ERROR] Test error');
  });

  it('should allow state management', () => {
    state.saveJobState('testJob', { 'file1': 'completed' });

    const jobState = state.getJobState('testJob');

    vitestExpect(jobState).toEqual({ 'file1': 'completed' });
    vitestExpect(state.isJobProcessed('testJob', 'file1')).toBe(true);
    vitestExpect(state.isJobProcessed('testJob', 'file2')).toBe(false);
  });

  it('should allow archiving files', () => {
    const testFile = join(tmpdir(), 'test-file.txt');
    writeFileSync(testFile, 'test content');

    const archivePath = archive.archive(testFile);

    const fileContent = readFileSync(archivePath, 'utf-8');

    vitestExpect(fileContent).toBe('test content');
    vitestExpect(readFileSync).toHaveBeenCalledWith(testFile, 'test content');
  });

  it('should allow archiving failed files', () => {
    const testFile = join(tmpdir(), 'test-failed.txt');
    writeFileSync(testFile, 'test failed content');

    const failedPath = archive.archiveFailed(testFile);

    const fileContent = readFileSync(failedPath, 'utf-8');

    vitestExpect(fileContent).toBe('test failed content');
    vitestExpect(readFileSync).toHaveBeenCalledWith(testFile, 'test failed content');
  });
});
