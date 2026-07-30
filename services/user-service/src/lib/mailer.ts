import nodemailer from 'nodemailer';
import { getConfig } from '../config/env';

/** Ошибка конфигурации SMTP. */
export class MailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailConfigurationError';
  }
}

/** Ошибка отправки письма через SMTP. */
export class MailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailSendError';
  }
}

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
};

const mapSmtpErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes('invalid login') ||
    lower.includes('authentication') ||
    lower.includes('535') ||
    lower.includes('534')
  ) {
    return 'Не удалось авторизоваться в SMTP. Проверьте SMTP_USER и Google App Password';
  }

  if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('etimedout')) {
    return 'Не удалось подключиться к SMTP-серверу. Проверьте SMTP_HOST/SMTP_PORT и сеть';
  }

  return 'Не удалось отправить письмо. Проверьте настройки SMTP';
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

    try {
      await transport.sendMail({ from, to, subject, text });
    } catch (error) {
      console.log('[Mailer] Failed to send email:', error);
      throw new MailSendError(mapSmtpErrorMessage(error));
    }
  }
}

export const mailer = new MailerService();
