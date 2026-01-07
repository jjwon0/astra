import { Job } from '../scheduler/Job';
import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';

export class VoiceMemoJob implements Job {
  name = 'voiceMemo';
  intervalMinutes: number;
  enabled: boolean;

  constructor(config: ConfigService) {
    const env = config.getEnv();
    this.intervalMinutes = parseInt(env.VOICE_MEMO_JOB_INTERVAL_MINUTES) || 5;
    this.enabled = env.VOICE_MEMO_JOB_ENABLED === 'true';
  }

  async execute(config: ConfigService, state: StateService, logger: Logger): Promise<void> {
    logger.info('VoiceMemoJob executed (stub - core pipeline not yet implemented)');
  }
}
