import { describe, it, expect, vi } from 'vitest';
import { StateService } from './state';
import { readFileSync, writeFileSync, existsSync } from 'fs';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('StateService', () => {
  const testStateFile = '/tmp/test-state.json';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should load state from existing file', () => {
      const existingState = { jobs: { voiceMemo: { test: 'data' } } };
      readFileSync.mockReturnValue(JSON.stringify(existingState));
      existsSync.mockReturnValue(true);

      const stateService = new StateService(testStateFile);

      expect(readFileSync).toHaveBeenCalledWith(testStateFile, 'utf-8');
      expect(stateService.getJobState('voiceMemo')).toEqual({ test: 'data' });
    });

    it('should create new state if file does not exist', () => {
      readFileSync.mockReturnValue('invalid json');
      existsSync.mockReturnValue(false);

      const stateService = new StateService(testStateFile);

      expect(writeFileSync).toHaveBeenCalled();
      expect(stateService.getJobState('voiceMemo')).toEqual({});
    });
  });

  describe('getJobState', () => {
    it('should return job state for existing job', () => {
      readFileSync.mockReturnValue(
        JSON.stringify({ jobs: { voiceMemo: { test: 'data' } } })
      );
      existsSync.mockReturnValue(true);

      const stateService = new StateService(testStateFile);
      const jobState = stateService.getJobState('voiceMemo');

      expect(jobState).toEqual({ test: 'data' });
    });

    it('should return empty object for non-existent job', () => {
      readFileSync.mockReturnValue(JSON.stringify({ jobs: {} }));
      existsSync.mockReturnValue(true);

      const stateService = new StateService(testStateFile);
      const jobState = stateService.getJobState('nonExistent');

      expect(jobState).toEqual({});
    });
  });

  describe('saveJobState', () => {
    it('should save job state', () => {
      writeFileSync.mockImplementation(() => {});

      const stateService = new StateService(testStateFile);
      stateService.saveJobState('voiceMemo', { 'file1': 'completed' });

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('"voiceMemo":{"file1":"completed"}'),
        'utf-8'
      );
    });
  });

  describe('isJobProcessed', () => {
    it('should return true for completed file', () => {
      readFileSync.mockReturnValue(
        JSON.stringify({ jobs: { voiceMemo: { 'file1': 'completed' } } })
      );
      existsSync.mockReturnValue(true);

      const stateService = new StateService(testStateFile);
      const result = stateService.isJobProcessed('voiceMemo', 'file1');

      expect(result).toBe(true);
    });

    it('should return false for in-progress file', () => {
      readFileSync.mockReturnValue(
        JSON.stringify({ jobs: { voiceMemo: { 'file1': 'in_progress' } } })
      );
      existsSync.mockReturnValue(true);

      const stateService = new StateService(testStateFile);
      const result = stateService.isJobProcessed('voiceMemo', 'file1');

      expect(result).toBe(false);
    });

    it('should return false for non-existent job', () => {
      readFileSync.mockReturnValue(JSON.stringify({ jobs: {} }));
      existsSync.mockReturnValue(true);

      const stateService = new StateService(testStateFile);
      const result = stateService.isJobProcessed('voiceMemo', 'file1');

      expect(result).toBe(false);
    });
  });
});
