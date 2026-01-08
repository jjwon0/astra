import { Job } from '../scheduler/Job';
import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';
import { ArchiveService } from '../utils/archive';
import { FileWatcher } from '../services/core/fileWatcher';
import { TranscriptionService } from '../services/core/transcription';
import { OrganizationService } from '../services/core/organization';
import { NotionSyncService } from '../services/core/notionSync';

export class VoiceMemoJob implements Job {
  name = 'voiceMemo';
  intervalMinutes: number;
  enabled: boolean;
  private fileWatcher: FileWatcher;
  private transcriptionService: TranscriptionService;
  private organizationService: OrganizationService;
  private notionSyncService: NotionSyncService;
  private archiveService: ArchiveService;

  constructor(config: ConfigService) {
    const env = config.getEnv();
    this.intervalMinutes = parseInt(env.VOICE_MEMO_JOB_INTERVAL_MINUTES) || 5;
    this.enabled = env.VOICE_MEMO_JOB_ENABLED === 'true';

    const schema = config.getSchema();

    this.fileWatcher = new FileWatcher(env.VOICE_MEMOS_DIR);
    this.transcriptionService = new TranscriptionService(
      env.GEMINI_API_KEY,
      parseInt(env.MAX_RETRIES)
    );
    this.organizationService = new OrganizationService(
      env.GEMINI_API_KEY,
      parseInt(env.MAX_RETRIES)
    );
    this.notionSyncService = new NotionSyncService(
      env.NOTION_API_KEY,
      schema,
      parseInt(env.MAX_RETRIES)
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

      const schema = config.getSchema();
      const organizationResult = await this.organizationService.organize(
        transcriptionResult.text,
        schema,
        logger
      );

      if (!organizationResult.success) {
        throw new Error(`Organization failed: ${organizationResult.error}`);
      }

      if (organizationResult.items.length === 0) {
        logger.info(`No items found in ${filename}, skipping sync`);
      } else {
        const syncResult = await this.notionSyncService.sync(
          organizationResult.items,
          filename,
          logger
        );

        if (!syncResult.success && syncResult.itemsFailed === syncResult.itemsCreated) {
          throw new Error(`Notion sync failed completely`);
        }

        if (syncResult.itemsFailed > 0) {
          logger.warn(`Sync completed with ${syncResult.itemsFailed} failure(s)`);
        }
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
}
