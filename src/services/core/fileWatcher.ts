import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { StateService } from '../../utils/state';
import { Logger } from '../../utils/logger';

export class FileWatcher {
  private voiceMemosDir: string;
  private jobName: string = 'voiceMemo';

  constructor(voiceMemosDir: string) {
    this.voiceMemosDir = voiceMemosDir;
  }

  async watch(state: StateService, logger: Logger): Promise<string[]> {
    logger.info(`Scanning directory: ${this.voiceMemosDir}`);

    if (!existsSync(this.voiceMemosDir)) {
      logger.error(`Voice memos directory not found: ${this.voiceMemosDir}`);
      throw new Error(`Voice memos directory not found: ${this.voiceMemosDir}`);
    }

    const files = readdirSync(this.voiceMemosDir);
    const audioFiles = files.filter((file) => {
      const ext = file.toLowerCase().split('.').pop();
      return ext === 'm4a' || ext === 'wav';
    });

    logger.info(`Found ${audioFiles.length} audio file(s)`);

    const newFiles: string[] = [];
    for (const file of audioFiles) {
      const isProcessed = state.isJobProcessed(this.jobName, file);
      if (!isProcessed) {
        newFiles.push(join(this.voiceMemosDir, file));
        logger.info(`New file detected: ${file}`);
      }
    }

    logger.info(`Found ${newFiles.length} new file(s) to process`);

    return newFiles;
  }
}
