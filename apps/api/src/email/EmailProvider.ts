export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(opts: SendEmailOptions): Promise<void>;
}
