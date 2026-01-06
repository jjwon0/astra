import { describe, it, expect, beforeEach } from 'vitest';
import { Logger } from '../src/utils/logger';
import { StateService } from '../src/utils/state';
import { ArchiveService } from '../src/utils/archive';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';

describe('Simple Production Readiness', () => {
  const testLogDir = join(tmpdir(), 'astra-test-logs');
  const testStateFile = join(tmpdir(), 'test-state.json');

  let logger: Logger;
  let state: StateService;
  let archive: ArchiveService;

  beforeEach(() => {
    logger = new Logger(join(testLogDir, 'production-test.log'));
    state = new StateService(testStateFile);
    archive = new ArchiveService(testLogDir, testStateFile);
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

    const logContent = readFileSync(join(testLogDir, 'production-test.log'), 'utf-8');

    expect(logContent).toContain('[INFO] Test info message');
    expect(logContent).toContain('[WARN] Test warning');
    expect(logContent).toContain('[ERROR] Test error');
  });

  it('should allow state management', () => {
    state.saveJobState('testJob', { file1: 'completed' });
    const jobState = state.getJobState('testJob');

    expect(jobState).toEqual({ file1: 'completed' });
    expect(state.isJobProcessed('testJob', 'file1')).toBe(true);
    expect(state.isJobProcessed('testJob', 'file2')).toBe(false);
  });

  it('should allow archiving files', async () => {
    const testFile = join(tmpdir(), 'test-file.txt');
    writeFileSync(testFile, 'test content');

    const archivePath = archive.archive(testFile);

    const fileContent = readFileSync(archivePath, 'utf-8');
    expect(fileContent).toBe('test content');
  });
});
