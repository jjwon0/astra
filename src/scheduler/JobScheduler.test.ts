import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobScheduler } from './JobScheduler';
import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';
import { Job } from './Job';

vi.mock('../services/config');
vi.mock('../utils/state');
vi.mock('../utils/logger');

describe('JobScheduler', () => {
  let scheduler: JobScheduler;
  let mockConfig: any;
  let mockState: any;
  let mockLogger: any;
  let mockJob: Job;
  let mockDisabledJob: Job;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockConfig = {
      getEnv: vi.fn(() => ({
        VOICE_MEMO_JOB_ENABLED: 'true',
        VOICE_MEMO_JOB_INTERVAL_MINUTES: '5',
      })),
    };

    mockState = {
      getJobState: vi.fn(() => ({})),
      saveJobState: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockJob = {
      name: 'testJob',
      intervalMinutes: 1,
      enabled: true,
      execute: vi.fn().mockResolvedValue(undefined),
    };

    mockDisabledJob = {
      name: 'disabledJob',
      intervalMinutes: 1,
      enabled: false,
      execute: vi.fn().mockResolvedValue(undefined),
    };

    scheduler = new JobScheduler(mockConfig as any, mockState as any, mockLogger as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty jobs array', () => {
      expect(scheduler.getJobs()).toEqual([]);
    });
  });

  describe('register', () => {
    it('should register a single job', () => {
      scheduler.register(mockJob);

      const jobs = scheduler.getJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toBe(mockJob);
    });

    it('should register multiple jobs', () => {
      scheduler.register(mockJob);
      scheduler.register(mockDisabledJob);

      const jobs = scheduler.getJobs();
      expect(jobs).toHaveLength(2);
      expect(jobs[0]).toBe(mockJob);
      expect(jobs[1]).toBe(mockDisabledJob);
    });
  });

  describe('start', () => {
    it('should create interval for enabled job', async () => {
      scheduler.register(mockJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      expect(mockJob.execute).toHaveBeenCalledTimes(1);
    });

    it('should skip disabled jobs', async () => {
      scheduler.register(mockDisabledJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      expect(mockDisabledJob.execute).not.toHaveBeenCalled();
    });

    it('should log error when job fails but continue scheduler', async () => {
      const errorJob: Job = {
        name: 'errorJob',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockRejectedValue(new Error('Test error')),
      };

      const anotherJob: Job = {
        name: 'anotherJob',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockResolvedValue(undefined),
      };

      scheduler.register(errorJob);
      scheduler.register(anotherJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);

      expect(mockLogger.error).toHaveBeenCalledWith('Job errorJob failed: Test error');
      expect(anotherJob.execute).toHaveBeenCalledTimes(1);
    });

    it('should run job repeatedly on interval', async () => {
      scheduler.register(mockJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(mockJob.execute).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(mockJob.execute).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(mockJob.execute).toHaveBeenCalledTimes(3);
    });

    it('should run multiple jobs independently', async () => {
      const job1: Job = {
        name: 'job1',
        intervalMinutes: 1,
        enabled: true,
        execute: vi.fn().mockResolvedValue(undefined),
      };

      const job2: Job = {
        name: 'job2',
        intervalMinutes: 2,
        enabled: true,
        execute: vi.fn().mockResolvedValue(undefined),
      };

      scheduler.register(job1);
      scheduler.register(job2);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(job1.execute).toHaveBeenCalledTimes(1);
      expect(job2.execute).toHaveBeenCalledTimes(0);

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(job1.execute).toHaveBeenCalledTimes(2);
      expect(job2.execute).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(job1.execute).toHaveBeenCalledTimes(3);
      expect(job2.execute).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(job1.execute).toHaveBeenCalledTimes(4);
      expect(job2.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    it('should clear all intervals', async () => {
      scheduler.register(mockJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(mockJob.execute).toHaveBeenCalledTimes(1);

      scheduler.stop();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(mockJob.execute).toHaveBeenCalledTimes(1);
    });

    it('should allow restart after stop', async () => {
      scheduler.register(mockJob);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(mockJob.execute).toHaveBeenCalledTimes(1);

      scheduler.stop();
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(mockJob.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('getJobs', () => {
    it('should return copy of jobs array', () => {
      scheduler.register(mockJob);
      scheduler.register(mockDisabledJob);

      const jobs = scheduler.getJobs();
      jobs.push({} as any);

      expect(scheduler.getJobs()).toHaveLength(2);
    });
  });
});
