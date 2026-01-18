import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';
import { JournalProcessingJob } from './JournalProcessingJob';

async function main() {
  const config = new ConfigService();
  await config.initialize();

  const env = config.getEnv();
  const state = new StateService(env.STATE_FILE);
  const logger = new Logger(env.LOG_FILE);

  const job = new JournalProcessingJob(config);
  await job.execute(config, state, logger);
}

main().catch(console.error);
