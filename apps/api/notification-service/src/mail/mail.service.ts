import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { createCounter, createLogger } from '@repo/observability';

const emailsSent = createCounter(
  'notification_emails_sent_total',
  'E-mails enviados pelo notification-service',
  ['template', 'result'],
);

@Injectable()
export class MailService implements OnModuleInit {
  private readonly log = createLogger('mail');
  private transporter!: Transporter;
  private from!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('SMTP_HOST', 'localhost');
    const port = Number(this.config.get<string>('SMTP_PORT', '1025'));
    this.from = this.config.get<string>(
      'MAIL_FROM',
      'Rodoviária <noreply@rodoviaria.local>',
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      tls: { rejectUnauthorized: false },
    });

    this.log.info('smtp ready', { host, port, from: this.from });
  }

  async send(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    template: string;
  }) {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html ?? `<pre>${input.text}</pre>`,
      });
      emailsSent.inc({ template: input.template, result: 'ok' });
      this.log.info('email_sent', {
        template: input.template,
        to: input.to,
        messageId: info.messageId,
      });
    } catch (error) {
      emailsSent.inc({ template: input.template, result: 'error' });
      this.log.error('email_failed', {
        template: input.template,
        to: input.to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
