import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { publishNotificationToUser } from './notification-stream';

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

export class NotificationsService {
  constructor(private prisma: PrismaClient) {}

  async createNotification(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: input,
    });

    publishNotificationToUser(notification.recipientUserId, notification);

    return notification;
  }

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
}
