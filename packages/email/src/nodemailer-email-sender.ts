import nodemailer from 'nodemailer';
import type { EmailSender, SendEmailInput } from '@cqp/core';

export interface NodemailerEmailSenderConfig {
  fromAddress: string;
  appPassword: string;
}

/**
 * See docs/adr/0035 — Gmail SMTP with an app password. Stated gap: no
 * lightweight local SMTP double exists in this repo, so the real send
 * is live-verified rather than covered by an automated test.
 */
export class NodemailerEmailSender implements EmailSender {
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(config: NodemailerEmailSenderConfig) {
    this.fromAddress = config.fromAddress;
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: config.fromAddress,
        pass: config.appPassword,
      },
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: input.to,
      ...(input.cc !== undefined ? { cc: input.cc } : {}),
      subject: input.subject,
      text: input.body,
      ...(input.attachments !== undefined
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              ...(a.contentType !== undefined ? { contentType: a.contentType } : {}),
            })),
          }
        : {}),
    });
  }
}
