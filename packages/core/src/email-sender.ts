export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

/**
 * Framework-free port (ADR-0010) — the real SMTP call lives in
 * @cqp/email's NodemailerEmailSender (see docs/adr/0035).
 */
export interface EmailSender {
  send(input: SendEmailInput): Promise<void>;
}
