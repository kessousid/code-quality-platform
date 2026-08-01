import type { EmailSender, SendEmailInput } from '@cqp/core';

/** Test double — the real Gmail SMTP send is live-verified instead (see docs/adr/0035). */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: SendEmailInput[] = [];

  async send(input: SendEmailInput): Promise<void> {
    this.sent.push(input);
  }
}
