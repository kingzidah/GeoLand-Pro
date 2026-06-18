import type { EmailProvider, SendEmailOptions } from './EmailProvider';
import { logger } from '../config/logger';

export class NoOpProvider implements EmailProvider {
  async send(opts: SendEmailOptions): Promise<void> {
    logger.info('[NoOpProvider] Email would be sent (no provider configured)', {
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
  }
}
