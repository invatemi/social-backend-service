import nodemailer from 'nodemailer';

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

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  if (!host || !user || !pass || !from) {
    throw new MailConfigurationError('SMTP is not configured');
  }

  return { host, port, user, pass, from };
};

export const sendMail = async ({ to, subject, text }: SendMailInput): Promise<void> => {
  const { host, port, user, pass, from } = getSmtpConfig();

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({ from, to, subject, text });
};
