#!/usr/bin/env bun

import { Logger } from './src/utils/logger.js';
import { StateService } from './src/utils/state.js';
import { ArchiveService } from './src/utils/archive.js';

const logger = new Logger('./test-production.log');

async function main() {
  console.log('Testing production infrastructure...');

  try {
    logger.info('Starting infrastructure test');

    logger.info('Test 1: Logger Service');
    const testLogger = new Logger('./test-logger.log');
    testLogger.info('Logger test info');
    testLogger.error('Logger test error');
    logger.info('✓ Logger service works');

    logger.info('Test 2: State Service');
    const testState = new StateService('./test-state.json');
    testState.saveJobState('testJob', { 'file1.txt': 'completed' });
    expect(testState.isJobProcessed('testJob', 'file1.txt')).toBe(true);
    testState.markJobCompleted('testJob', 'file2.txt');
    expect(testState.isJobProcessed('testJob', 'file2.txt')).toBe(true);
    logger.info('✓ State service works');

    logger.info('Test 3: Archive Service');
    const testArchive = new ArchiveService('./test-archive', './test-failed');

    const testFile = './test-file.txt';
    Bun.writeFileSync(testFile, 'test content');
    const archivePath = testArchive.archive(testFile);

    expect(Bun.readFileSync(archivePath, 'utf-8')).toBe('test content');
    logger.info('✓ Archive service works');

    logger.info('All infrastructure tests passed!');
    console.log('✅ All services validated successfully!');

    process.exit(0);
  } catch (error) {
    logger.error(`Infrastructure test failed: ${error.message}`);
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
