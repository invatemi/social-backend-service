import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { publishNotificationToUser } from './socket-hub';
import { mapNotificationToSseEvent } from './sse-event-mapper';

export interface CreateNotificationInput {
  recipientUserId: number;
  actorUserId?: number | null;
  type: string;
  title: string;
  body: string;
  payload?: Prisma.InputJsonValue;
}

const validateUserId = (userId: unknown): number => {
  const id = Number(userId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid user ID');
  }

  return id;
};

/** Бизнес-логика хранения и доставки уведомлений. */
export class NotificationsService {
  /** Принимает Prisma-клиент для работы с notifications-базой. */
  constructor(private prisma: PrismaClient) {}

  /** Создаёт уведомление и отправляет его через WebSocket. */
  async createNotification(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: input,
    });

    const sseEvent = mapNotificationToSseEvent(notification);
    if (sseEvent) {
      publishNotificationToUser(
        notification.recipientUserId,
        sseEvent.event,
        sseEvent.data
      );
    }

    return notification;
  }

  /** Возвращает последние уведомления пользователя. */
  async listUserNotifications(userId: number, unreadOnly = false) {
    const recipientUserId = validateUserId(userId);

    return this.prisma.notification.findMany({
      where: {
        recipientUserId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Помечает одно уведомление как прочитанное. */
  async markAsRead(userId: number, notificationId: number) {
    const recipientUserId = validateUserId(userId);
    const id = validateUserId(notificationId);

    return this.prisma.notification.updateMany({
      where: {
        id,
        recipientUserId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  /** Помечает все уведомления пользователя как прочитанные. */
  async markAllAsRead(userId: number) {
    const recipientUserId = validateUserId(userId);

    return this.prisma.notification.updateMany({
      where: {
        recipientUserId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  /** Deletes notifications older than retentionDays (default 90). */
  async pruneOldNotifications(retentionDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}
