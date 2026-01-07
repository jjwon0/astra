import { ConfigService } from '../services/config';
import { StateService } from '../utils/state';
import { Logger } from '../utils/logger';

export interface Job {
  name: string;
  intervalMinutes: number;
  enabled: boolean;
  execute(config: ConfigService, state: StateService, logger: Logger): Promise<void>;
}
