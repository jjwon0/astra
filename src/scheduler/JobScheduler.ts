import { Job } from './Job';
import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';

export class JobScheduler {
  private jobs: Job[] = [];
  private intervals: NodeJS.Timeout[] = [];

  constructor(
    private config: ConfigService,
    private state: StateService,
    private logger: Logger
  ) {}

  register(job: Job): void {
    this.jobs.push(job);
  }

  start(): void {
    for (const job of this.jobs) {
      if (!job.enabled) {
        continue;
      }

      const interval = setInterval(
        async () => {
          try {
            await job.execute(this.config, this.state, this.logger);
          } catch (error: any) {
            this.logger.error(`Job ${job.name} failed: ${error.message}`);
          }
        },
        job.intervalMinutes * 60 * 1000
      );

      this.intervals.push(interval);
    }
  }

  stop(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
  }

  getJobs(): Job[] {
    return [...this.jobs];
  }
}
