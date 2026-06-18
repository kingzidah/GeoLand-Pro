import { Resend } from 'resend';
import type { EmailProvider, SendEmailOptions } from './EmailProvider';

export class ResendProvider implements EmailProvider {
  private client: Resend;
  private from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(opts: SendEmailOptions): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html && { html: opts.html }),
    });

    if (error) {
      throw new Error(`Resend delivery failed: ${error.message}`);
    }
  }
}
