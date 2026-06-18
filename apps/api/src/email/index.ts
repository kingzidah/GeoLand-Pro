import { env } from '../config/env';
import { brand } from '../config/brand.config';
import type { EmailProvider } from './EmailProvider';
import { ResendProvider } from './ResendProvider';
import { NoOpProvider } from './NoOpProvider';

export type { EmailProvider };
export { ResendProvider, NoOpProvider };

export function getEmailProvider(): EmailProvider {
  if (env.RESEND_API_KEY) {
    const from = env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`;
    return new ResendProvider(env.RESEND_API_KEY, from);
  }
  return new NoOpProvider();
}
