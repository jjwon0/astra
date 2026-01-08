import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';

interface AppState {
  jobs: Record<string, JobState>;
}

interface JobState {
  [key: string]: any;
}

const STATE_FILE = './state.json';

export class StateService {
  private state: AppState = {
    jobs: {},
  };

  constructor(stateFile: string = STATE_FILE) {
    this.load(stateFile);
  }

  private load(stateFile: string): void {
    if (existsSync(stateFile)) {
      try {
        const content = readFileSync(stateFile, 'utf-8');
        this.state = JSON.parse(content) as AppState;
      } catch (error) {
        console.error(`Failed to load state: ${error}`);
        this.state = { jobs: {} };
      }
    } else {
      this.state = { jobs: {} };
      this.save(stateFile);
    }
  }

  private save(stateFile: string): void {
    const dir = stateFile.substring(0, stateFile.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpFile = `${stateFile}.tmp`;
    writeFileSync(tmpFile, JSON.stringify(this.state, null, 2));
    renameSync(tmpFile, stateFile);
  }

  getJobState(jobName: string): JobState {
    return this.state.jobs[jobName] || {};
  }

  saveJobState(jobName: string, jobState: JobState): void {
    this.state.jobs[jobName] = jobState;
    this.save(STATE_FILE);
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
    this.save(STATE_FILE);
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
    this.save(STATE_FILE);
  }
}
