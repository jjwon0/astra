import { ConfigService } from './services/config';
import { StateService } from './utils/state';
import { Logger } from './utils/logger';
import { JobScheduler } from './scheduler/JobScheduler';
import { VoiceMemoJob } from './jobs/VoiceMemoJob';
import { JournalProcessingJob } from './jobs/JournalProcessingJob';

async function main(): Promise<void> {
  try {
    console.log('Starting Astra...');

    const config = new ConfigService();
    await config.initialize();
    console.log('Config initialized');

    const env = config.getEnv();

    const state = new StateService();
    const logger = new Logger(env.LOG_FILE);

    const scheduler = new JobScheduler(config, state, logger);

    const voiceMemoJob = new VoiceMemoJob(config);
    scheduler.register(voiceMemoJob);

    const journalProcessingJob = new JournalProcessingJob(config);
    scheduler.register(journalProcessingJob);

    await scheduler.start();
    console.log(
      `Astra started with ${voiceMemoJob.name} job running every ${voiceMemoJob.intervalMinutes} minutes`
    );
    if (journalProcessingJob.enabled) {
      console.log(
        `  ${journalProcessingJob.name} job running every ${journalProcessingJob.intervalMinutes} minutes`
      );
    }
    console.log('Press Ctrl+C to stop');

    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await scheduler.stop();
      console.log('Astra stopped');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down...');
      await scheduler.stop();
      console.log('Astra stopped');
      process.exit(0);
    });
  } catch (error: any) {
    console.error(`Failed to start Astra: ${error.message || String(error)}`);
    process.exit(1);
  }
}

main();
