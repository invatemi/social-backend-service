import { NotificationsService } from '../../src/routes/notifications/notifications.service';
import { publishNotificationToUser } from '../../src/routes/notifications/socket-hub';

jest.mock('../../src/routes/notifications/socket-hub', () => ({
  publishNotificationToUser: jest.fn(),
}));

describe('NotificationsService unit', () => {
  const prismaMock = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createNotification: создает уведомление и публикует websocket-событие', async () => {
    prismaMock.notification.create.mockResolvedValue({
      id: 1,
      recipientUserId: 42,
      actorUserId: 10,
      type: 'FRIEND_REQUESTED',
      title: 'title',
      body: 'body',
      payload: {
        fromUser: { id: 10, name: 'alice' },
        toUser: { id: 42, name: 'bob' },
      },
      readAt: null,
      createdAt: new Date(),
    });
    const service = new NotificationsService(prismaMock as any);

    const result = await service.createNotification({
      recipientUserId: 42,
      actorUserId: 10,
      type: 'FRIEND_REQUESTED',
      title: 'title',
      body: 'body',
      payload: {
        fromUser: { id: 10, name: 'alice' },
        toUser: { id: 42, name: 'bob' },
      },
    });

    expect(result.id).toBe(1);
    expect(publishNotificationToUser).toHaveBeenCalledWith(
      42,
      'notification:friend_request',
      expect.objectContaining({
        id: 1,
      })
    );
  });

  it('listUserNotifications: учитывает unreadOnly=true', async () => {
    prismaMock.notification.findMany.mockResolvedValue([]);
    const service = new NotificationsService(prismaMock as any);

    await service.listUserNotifications(7, true);

    expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
      where: { recipientUserId: 7, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  it('markAsRead: обновляет только непрочитанное уведомление пользователя', async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
    const service = new NotificationsService(prismaMock as any);

    const result = await service.markAsRead(5, 9);

    expect(result).toEqual({ count: 1 });
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 9, recipientUserId: 5, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('markAllAsRead: бросает ошибку на невалидный userId', async () => {
    const service = new NotificationsService(prismaMock as any);

    await expect(service.markAllAsRead(0 as any)).rejects.toThrow('Invalid user ID');
  });
});
