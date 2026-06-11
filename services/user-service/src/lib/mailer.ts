import nodemailer from 'nodemailer';
import { getConfig } from '../config/env';

/** Ошибка конфигурации SMTP. */
export class MailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailConfigurationError';
  }
}

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
};

/** Отправка email через SMTP. */
export class MailerService {
  /** Читает и проверяет настройки SMTP. */
  private getSmtpConfig() {
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = getConfig();

    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      throw new MailConfigurationError('SMTP is not configured');
    }

    return { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, from: smtpFrom };
  }

  /** Отправляет письмо получателю. */
  async send({ to, subject, text }: SendMailInput): Promise<void> {
    const { host, port, user, pass, from } = this.getSmtpConfig();
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transport.sendMail({ from, to, subject, text });
  }
}

export const mailer = new MailerService();
