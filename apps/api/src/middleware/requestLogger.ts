import morgan, { StreamOptions } from 'morgan';
import { logger } from '../config/logger';
import { env } from '../config/env';

const stream: StreamOptions = {
  write: (message: string) => logger.http(message.trim()),
};

// 'combined' in production for full IP/user-agent context; 'dev' for coloured output locally
export const requestLogger = morgan(
  env.NODE_ENV === 'production' ? 'combined' : 'dev',
  { stream }
);
