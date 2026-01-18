import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';

/**
 * JournalProcessingJob - Processes aggregated journal entries with AI summarization.
 *
 * This job performs:
 * - AI summarization of daily journal entries
 * - Mood/theme extraction and metadata tagging
 * - Marks journal pages as processed
 *
 * Currently stubbed - implementation pending.
 */
export class JournalProcessingJob {
  name = 'journalProcessing';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config: ConfigService) {
    // Config available for future implementation
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_config: ConfigService, _state: StateService, logger: Logger): Promise<void> {
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
