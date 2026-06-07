import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../../generated/prisma/client';
import { KrakenDRequest, krakendAuthMiddleware } from '../../middleware/krakend-auth';
import { registerNotificationStream } from './notification-stream';
import { NotificationsService } from './notifications.service';

const router = Router();

const notificationIdSchema = z.coerce.number().int().positive();

router.get(
  '/stream',
  krakendAuthMiddleware,
  (req: KrakenDRequest, res: Response) => {
    registerNotificationStream(req.user!.userId, res);
  }
);

router.get(
  '/',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const notificationsService = new NotificationsService(prisma);
      const unreadOnly = req.query.unreadOnly === 'true';

      const notifications = await notificationsService.listUserNotifications(
        req.user!.userId,
        unreadOnly
      );

      res.status(200).json({
        success: true,
        notifications,
        total: notifications.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/read',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const notificationsService = new NotificationsService(prisma);
      const notificationId = notificationIdSchema.parse(req.params.id);

      const result = await notificationsService.markAsRead(
        req.user!.userId,
        notificationId
      );

      res.status(200).json({
        success: true,
        updated: result.count,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/read-all',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const notificationsService = new NotificationsService(prisma);

      const result = await notificationsService.markAllAsRead(req.user!.userId);

      res.status(200).json({
        success: true,
        updated: result.count,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
