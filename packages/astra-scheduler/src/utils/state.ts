import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';

interface AppState {
  jobs: Record<string, JobState>;
}

interface JobState {
  [key: string]: any;
}

const DEFAULT_STATE_FILE = './state.json';

export class StateService {
  private state: AppState = {
    jobs: {},
  };
  private stateFile: string;

  constructor(stateFile: string = DEFAULT_STATE_FILE) {
    this.stateFile = stateFile;
    this.load();
  }

  private load(): void {
    if (existsSync(this.stateFile)) {
      try {
        const content = readFileSync(this.stateFile, 'utf-8');
        this.state = JSON.parse(content) as AppState;
      } catch (error) {
        console.error(`Failed to load state: ${error}`);
        this.state = { jobs: {} };
      }
    } else {
      this.state = { jobs: {} };
      this.save();
    }
  }

  private save(): void {
    const dir = this.stateFile.substring(0, this.stateFile.lastIndexOf('/'));
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpFile = `${this.stateFile}.tmp`;
    writeFileSync(tmpFile, JSON.stringify(this.state, null, 2));
    renameSync(tmpFile, this.stateFile);
  }

  getJobState(jobName: string): JobState {
    return this.state.jobs[jobName] || {};
  }

  saveJobState(jobName: string, jobState: JobState): void {
    this.state.jobs[jobName] = jobState;
    this.save();
  }

  isJobProcessed(jobName: string, identifier: string): boolean {
    const jobState = this.state.jobs[jobName];
    if (!jobState) return false;

    if (typeof jobState === 'object') {
      const processedFiles = jobState as Record<string, string>;
      return processedFiles[identifier] === 'completed';
    }

    return false;
  }

  markJobCompleted(jobName: string, identifier: string): void {
    const jobState = this.state.jobs[jobName];
    if (!jobState || typeof jobState !== 'object') {
      this.state.jobs[jobName] = {};
    }

    (this.state.jobs[jobName] as Record<string, string>)[identifier] = 'completed';
    this.save();
  }

  markJobFailed(jobName: string, identifier: string, reason: string): void {
    const jobState = this.state.jobs[jobName] || {};
    if (typeof jobState !== 'object') {
      this.state.jobs[jobName] = {};
    }

    const currentState = this.state.jobs[jobName] as Record<string, any>;
    if (!currentState.failed) {
      currentState.failed = [];
    }

    if (!currentState.failed.includes(identifier)) {
      currentState.failed.push(identifier);
    }

    this.state.jobs[jobName] = currentState;
    this.save();
  }
}
