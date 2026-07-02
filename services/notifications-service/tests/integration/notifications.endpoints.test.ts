import express from 'express';
import request from 'supertest';
import notificationsRoutes from '../../src/routes/notifications/endpoints';
import { errorHandler } from '../../src/middleware/error-handler';
import { testAuthHeader } from '../helpers/auth';

const listUserNotificationsMock = jest.fn();
const markAsReadMock = jest.fn();
const markAllAsReadMock = jest.fn();

jest.mock('../../src/routes/notifications/notifications.service', () => ({
  NotificationsService: jest.fn().mockImplementation(() => ({
    listUserNotifications: listUserNotificationsMock,
    markAsRead: markAsReadMock,
    markAllAsRead: markAllAsReadMock,
  })),
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', (req, _res, next) => {
    (req as any).prisma = {};
    next();
  }, notificationsRoutes);
  app.use(errorHandler);
  return app;
};

describe('Notifications endpoints integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/notifications: возвращает данные пользователя', async () => {
    listUserNotificationsMock.mockResolvedValue([{ id: 1 }]);
    const app = buildApp();

    const response = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Authorization', testAuthHeader(55));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      notifications: [{ id: 1 }],
      total: 1,
    });
    expect(listUserNotificationsMock).toHaveBeenCalledWith(55, true);
  });

  it('PATCH /api/notifications/:id/read: валидный кейс', async () => {
    markAsReadMock.mockResolvedValue({ count: 1 });
    const app = buildApp();

    const response = await request(app)
      .patch('/api/notifications/99/read')
      .set('Authorization', testAuthHeader(8));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, updated: 1 });
    expect(markAsReadMock).toHaveBeenCalledWith(8, 99);
  });

  it('PATCH /api/notifications/read-all: валидный кейс', async () => {
    markAllAsReadMock.mockResolvedValue({ count: 5 });
    const app = buildApp();

    const response = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', testAuthHeader(8));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, updated: 5 });
  });

  it('returns 401 when user token is missing', async () => {
    const app = buildApp();
    const response = await request(app).get('/api/notifications');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
