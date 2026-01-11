import { stat } from 'fs/promises';
import { Job } from '../scheduler/Job';
import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';
import { ArchiveService } from '../utils/archive';
import { parseVoiceMemoTimestamp } from '../utils/parseVoiceMemoTimestamp';
import { FileWatcher } from '../services/core/fileWatcher';
import { TranscriptionService } from '../services/core/transcription';
import { OrganizationService } from '../services/core/organization';
import { NotionSyncService } from '../services/core/notionSync';
import { JournalService } from '../services/core/journal';
import { JournalNotionService } from '../services/core/journalNotionSync';

export class VoiceMemoJob implements Job {
  name = 'voiceMemo';
  intervalMinutes: number;
  enabled: boolean;
  private fileWatcher: FileWatcher;
  private transcriptionService: TranscriptionService;
  private organizationService: OrganizationService;
  private notionSyncService: NotionSyncService;
  private journalService: JournalService;
  private journalNotionService: JournalNotionService;
  private archiveService: ArchiveService;

  constructor(config: ConfigService) {
    const env = config.getEnv();
    this.intervalMinutes = parseInt(env.VOICE_MEMO_JOB_INTERVAL_MINUTES) || 5;
    this.enabled = env.VOICE_MEMO_JOB_ENABLED === 'true';

    const schema = config.getSchema();
    const maxRetries = parseInt(env.MAX_RETRIES);

    this.fileWatcher = new FileWatcher(env.VOICE_MEMOS_DIR);
    this.transcriptionService = new TranscriptionService(env.GEMINI_API_KEY, maxRetries);
    this.organizationService = new OrganizationService(env.GEMINI_API_KEY, maxRetries);
    this.notionSyncService = new NotionSyncService(env.NOTION_API_KEY, schema, maxRetries);
    this.journalService = new JournalService(env.GEMINI_API_KEY, maxRetries);
    this.journalNotionService = new JournalNotionService(
      env.NOTION_API_KEY,
      schema.journalDatabaseId,
      maxRetries
    );
    this.archiveService = new ArchiveService(env.ARCHIVE_DIR, env.FAILED_DIR);
  }

  async execute(config: ConfigService, state: StateService, logger: Logger): Promise<void> {
    try {
      logger.info('VoiceMemoJob started');

      const newFiles = await this.fileWatcher.watch(state, logger);

      if (newFiles.length === 0) {
        logger.info('No new files to process');
        return;
      }

      for (const filePath of newFiles) {
        await this.processFile(filePath, config, state, logger);
      }

      logger.info('VoiceMemoJob completed');
    } catch (error: any) {
      logger.error(`VoiceMemoJob failed: ${error.message || String(error)}`);
      throw error;
    }
  }

  private async processFile(
    filePath: string,
    config: ConfigService,
    state: StateService,
    logger: Logger
  ): Promise<void> {
    const filename = filePath.split('/').pop() || filePath;
    logger.info(`Processing file: ${filename}`);

    try {
      const transcriptionResult = await this.transcriptionService.transcribe(filePath, logger);

      if (!transcriptionResult.success) {
        throw new Error(`Transcription failed: ${transcriptionResult.error}`);
      }

      // Parse recording time from filename, fallback to file creation time
      const recordedAt = parseVoiceMemoTimestamp(filename) ?? (await stat(filePath)).birthtime;

      // Route based on prefix: TODO/NOTE → organization, everything else → journal
      const intent = this.detectIntent(transcriptionResult.text);

      if (intent === 'JOURNAL') {
        await this.processJournalEntry(filePath, transcriptionResult.text, recordedAt, logger);
      } else {
        await this.processTodoNoteEntry(transcriptionResult.text, filename, recordedAt, config, logger);
      }

      this.archiveService.archive(filePath);
      state.markJobCompleted(this.name, filename);
      logger.info(`Successfully processed ${filename}`);
    } catch (error: any) {
      logger.error(`Failed to process ${filename}: ${error.message || String(error)}`);

      try {
        this.archiveService.archiveFailed(filePath);
        state.markJobFailed(this.name, filename, error.message || String(error));
      } catch (archiveError: any) {
        logger.error(
          `Failed to archive ${filename}: ${archiveError.message || String(archiveError)}`
        );
      }
    }
  }

  private detectIntent(transcript: string): 'TODO' | 'NOTE' | 'JOURNAL' {
    const text = transcript.trim();

    // Check for TODO prefix: "todo:", "to do:", "to-do:", "todo,"
    if (/^to[\s-]?do[,:.\s]/i.test(text)) {
      return 'TODO';
    }

    // Check for NOTE prefix: "note:", "note,"
    if (/^note[,:.\s]/i.test(text)) {
      return 'NOTE';
    }

    // Everything else → journal (including explicit "journal" prefix)
    return 'JOURNAL';
  }

  private stripPrefixKeyword(transcript: string): string {
    return transcript
      .trim()
      .replace(/^(to[\s-]?do|note|journal)[,.:!?\s]*/i, '')
      .trim();
  }

  private async processJournalEntry(
    filePath: string,
    transcript: string,
    recordedAt: Date,
    logger: Logger
  ): Promise<void> {
    const filename = filePath.split('/').pop() || filePath;
    logger.info(`Detected journal entry in ${filename}`);

    const cleanedTranscript = this.stripPrefixKeyword(transcript);

    const formatResult = await this.journalService.format(cleanedTranscript, logger);
    if (!formatResult.success) {
      throw new Error(`Journal formatting failed: ${formatResult.error}`);
    }

    const syncResult = await this.journalNotionService.syncEntry(
      formatResult.formattedText,
      recordedAt,
      logger
    );

    if (!syncResult.success) {
      throw new Error(`Journal sync failed: ${syncResult.error}`);
    }

    logger.info(
      `Journal entry ${syncResult.isNewPage ? 'created' : 'appended'} to page ${syncResult.pageId}`
    );
  }

  private async processTodoNoteEntry(
    transcript: string,
    filename: string,
    recordedAt: Date,
    config: ConfigService,
    logger: Logger
  ): Promise<void> {
    const schema = config.getSchema();
    const organizationResult = await this.organizationService.organize(transcript, schema, logger);

    if (!organizationResult.success) {
      throw new Error(`Organization failed: ${organizationResult.error}`);
    }

    if (organizationResult.items.length === 0) {
      logger.info(`No items found in ${filename}, skipping sync`);
      return;
    }

    const syncResult = await this.notionSyncService.sync(
      organizationResult.items,
      filename,
      recordedAt,
      logger
    );

    if (!syncResult.success && syncResult.itemsFailed === syncResult.itemsCreated) {
      throw new Error(`Notion sync failed completely`);
    }

    if (syncResult.itemsFailed > 0) {
      logger.warn(`Sync completed with ${syncResult.itemsFailed} failure(s)`);
    }
  }
}
