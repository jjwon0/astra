import { Job } from '../scheduler/Job';
import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';

/**
 * JournalProcessingJob - Processes aggregated journal entries with AI summarization.
 *
 * This job runs less frequently than VoiceMemoJob and performs:
 * - AI summarization of daily journal entries
 * - Mood/theme extraction and metadata tagging
 * - Marks journal pages as processed
 *
 * Currently stubbed - implementation pending.
 */
export class JournalProcessingJob implements Job {
  name = 'journalProcessing';
  intervalMinutes: number;
  enabled: boolean;

  constructor(config: ConfigService) {
    const env = config.getEnv();
    // Run less frequently than voice memo job (e.g., hourly)
    this.intervalMinutes = parseInt(env.JOURNAL_PROCESSING_JOB_INTERVAL_MINUTES || '60');
    this.enabled = env.JOURNAL_PROCESSING_JOB_ENABLED === 'true';
  }

  async execute(config: ConfigService, state: StateService, logger: Logger): Promise<void> {
    logger.info('JournalProcessingJob: Not yet implemented');

    // TODO: Query journal pages where processed = false
    // TODO: For each unprocessed page:
    //   - Read all entries from the page
    //   - Generate AI summary of the day's journal
    //   - Extract mood/themes/key insights
    //   - Update page with summary block at top
    //   - Add metadata properties (mood, themes)
    //   - Mark page as processed = true
  }
}
