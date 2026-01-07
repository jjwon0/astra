import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobScheduler } from '../src/scheduler/JobScheduler';
import { ConfigService } from '../src/services/config';
import { StateService } from '../src/utils/state';
import { Logger } from '../src/utils/logger';
import { Job } from '../src/scheduler/Job';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

describe('JobScheduler Integration', () => {
  const testDir = join(tmpdir(), 'astra-scheduler-test');
  const testLogFile = join(testDir, 'scheduler.log');
  const testStateFile = join(testDir, 'state.json');

  let scheduler: JobScheduler;
  let config: ConfigService;
  let state: StateService;
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    process.env.GEMINI_API_KEY = 'test_key';
    process.env.NOTION_API_KEY = 'test_key';
    process.env.PARENT_PAGE_ID = 'test_page';

    config = new ConfigService();
    state = new StateService(testStateFile);
    logger = new Logger(testLogFile);

    scheduler = new JobScheduler(config, state, logger);
  });

  afterEach(() => {
    scheduler.stop();
    vi.restoreAllMocks();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Multiple Jobs Running', () => {
    it('should run multiple jobs with different intervals', async () => {
      const executionLog: string[] = [];

      const job1: Job = {
        name: 'job1',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockImplementation(async () => {
          executionLog.push('job1');
        }),
      };

      const job2: Job = {
        name: 'job2',
        intervalMinutes: 2,
        enabled: true,
        execute: vi.fn().mockImplementation(async () => {
          executionLog.push('job2');
        }),
      };

      scheduler.register(job1);
      scheduler.register(job2);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

      expect(job1.execute).toHaveBeenCalledTimes(2);
      expect(job2.execute).toHaveBeenCalledTimes(1);
    });

    it('should run jobs independently without blocking', async () => {
      let job1Started = false;
      let job2Started = false;
      let job1Finished = false;

      const job1: Job = {
        name: 'job1',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockImplementation(async () => {
          job1Started = true;
          await new Promise((resolve) => setTimeout(resolve, 100));
          job1Finished = true;
        }),
      };

      const job2: Job = {
        name: 'job2',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockImplementation(async () => {
          job2Started = true;
        }),
      };

      scheduler.register(job1);
      scheduler.register(job2);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      expect(job1Started).toBe(true);
      expect(job2Started).toBe(true);
    });
  });

  describe('Job Failure Scenarios', () => {
    it('should continue running other jobs when one fails', async () => {
      const failingJob: Job = {
        name: 'failingJob',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockRejectedValue(new Error('Job failed')),
      };

      const healthyJob: Job = {
        name: 'healthyJob',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockResolvedValue(undefined),
      };

      scheduler.register(failingJob);
      scheduler.register(healthyJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      expect(failingJob.execute).toHaveBeenCalledTimes(1);
      expect(healthyJob.execute).toHaveBeenCalledTimes(1);
    });

    it('should log error when job fails', async () => {
      const failingJob: Job = {
        name: 'failingJob',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockRejectedValue(new Error('Test error')),
      };

      scheduler.register(failingJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      const { readFileSync } = await import('fs');
      const logContent = readFileSync(testLogFile, 'utf-8');
      expect(logContent).toContain('[ERROR]');
      expect(logContent).toContain('Job failingJob failed');
    });
  });

  describe('State Persistence', () => {
    it('should persist job state after execution', async () => {
      const testJob: Job = {
        name: 'testJob',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockImplementation(async (_, stateService) => {
          stateService.saveJobState('testJob', {
            lastRun: new Date().toISOString(),
            count: 1,
          });
        }),
      };

      scheduler.register(testJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      expect(testJob.execute).toHaveBeenCalledTimes(1);

      const savedState = state.getJobState('testJob');
      expect(savedState.lastRun).toBeDefined();
      expect(savedState.count).toBe(1);
    });

    it('should load previous job state on next execution', async () => {
      state.saveJobState('persistentJob', { count: 5, lastRun: '2025-01-05' });

      const persistentJob: Job = {
        name: 'persistentJob',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockImplementation(async (_, stateService) => {
          const jobState = stateService.getJobState('persistentJob');
          expect(jobState.count).toBe(5);
          expect(jobState.lastRun).toBe('2025-01-05');
        }),
      };

      scheduler.register(persistentJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      expect(persistentJob.execute).toHaveBeenCalledTimes(1);
    });

    it('should maintain separate state for each job', async () => {
      const job1: Job = {
        name: 'job1',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockImplementation(async (_, stateService) => {
          stateService.saveJobState('job1', { counter: 1 });
        }),
      };

      const job2: Job = {
        name: 'job2',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockImplementation(async (_, stateService) => {
          stateService.saveJobState('job2', { counter: 2 });
        }),
      };

      scheduler.register(job1);
      scheduler.register(job2);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      const job1State = state.getJobState('job1');
      const job2State = state.getJobState('job2');

      expect(job1State.counter).toBe(1);
      expect(job2State.counter).toBe(2);
    });
  });

  describe('Disabled Jobs', () => {
    it('should not create intervals for disabled jobs', async () => {
      const disabledJob: Job = {
        name: 'disabledJob',
        intervalMinutes: 1,
        enabled: false,
        execute: vi.fn().mockResolvedValue(undefined),
      };

      scheduler.register(disabledJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      expect(disabledJob.execute).not.toHaveBeenCalled();
    });

    it('should run enabled jobs when others are disabled', async () => {
      const enabledJob: Job = {
        name: 'enabledJob',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockResolvedValue(undefined),
      };

      const disabledJob: Job = {
        name: 'disabledJob',
        intervalMinutes: 1,
        enabled: false,
        execute: vi.fn().mockResolvedValue(undefined),
      };

      scheduler.register(enabledJob);
      scheduler.register(disabledJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      expect(enabledJob.execute).toHaveBeenCalledTimes(1);
      expect(disabledJob.execute).not.toHaveBeenCalled();
    });
  });

  describe('Scheduler Lifecycle', () => {
    it('should allow stopping and restarting', async () => {
      const testJob: Job = {
        name: 'testJob',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockResolvedValue(undefined),
      };

      scheduler.register(testJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(testJob.execute).toHaveBeenCalledTimes(1);

      scheduler.stop();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(testJob.execute).toHaveBeenCalledTimes(1);

      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(testJob.execute).toHaveBeenCalledTimes(2);
    });
  });
});
