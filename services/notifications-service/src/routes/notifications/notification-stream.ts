import { Response } from 'express';

const clients = new Map<number, Set<Response>>();

export const registerNotificationStream = (
  userId: number,
  response: Response
): void => {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders?.();

  response.write('retry: 5000\n\n');

  const userClients = clients.get(userId) ?? new Set<Response>();
  userClients.add(response);
  clients.set(userId, userClients);

  const heartbeat = setInterval(() => {
    response.write(': heartbeat\n\n');
  }, 30000);

  response.on('close', () => {
    clearInterval(heartbeat);
    userClients.delete(response);

    if (userClients.size === 0) {
      clients.delete(userId);
    }
  });
};

export const publishNotificationToUser = (
  userId: number,
  notification: unknown
): void => {
  const userClients = clients.get(userId);

  if (!userClients) {
    return;
  }

  const payload = JSON.stringify(notification);

  for (const client of userClients) {
    client.write(`event: notification.created\n`);
    client.write(`data: ${payload}\n\n`);
  }
};
