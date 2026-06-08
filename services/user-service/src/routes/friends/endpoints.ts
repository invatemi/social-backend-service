import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { FriendsService } from './friends.service';
import { KrakenDRequest, krakendAuthMiddleware } from '../../middleware/krakend-auth'; 
import { parsePaginationQuery } from '../../utils/pagination';

const router = Router();

// ==================== ЗАЩИЩЁННЫЕ ЭНДПОИНТЫ ====================

// Мои друзья
router.get(
  '/me',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const userId = req.user!.userId;
      const result = await friendsService.getFriends(userId, parsePaginationQuery(req.query));

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Входящие заявки в друзья
router.get(
  '/requests/incoming',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const userId = req.user!.userId;
      const result = await friendsService.getIncomingRequests(
        userId,
        parsePaginationQuery(req.query)
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Исходящие заявки в друзья
router.get(
  '/requests/outgoing',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const userId = req.user!.userId;
      const result = await friendsService.getOutgoingRequests(
        userId,
        parsePaginationQuery(req.query)
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Отправить заявку в друзья
router.post(
  '/:id/request',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const fromUserId = req.user!.userId;
      const toUserId = parseInt(String(req.params.id), 10);

      const result = await friendsService.sendFriendRequest(fromUserId, toUserId);

      res.status(201).json({
        success: true,
        message: 'Friend request sent',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Принять заявку в друзья
router.post(
  '/requests/:id/accept',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const receiverId = req.user!.userId;
      const requestId = parseInt(String(req.params.id), 10);

      const result = await friendsService.acceptFriendRequest(receiverId, requestId);

      res.status(200).json({
        success: true,
        message: 'Friend request accepted',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Отменить исходящую заявку в друзья
router.post(
  '/requests/:id/cancel',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const userId = req.user!.userId;
      const requestId = parseInt(String(req.params.id), 10);

      const result = await friendsService.cancelFriendRequest(userId, requestId);

      res.status(200).json({
        success: true,
        message: 'Friend request cancelled',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Отклонить входящую заявку в друзья
router.post(
  '/requests/:id/decline',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const userId = req.user!.userId;
      const requestId = parseInt(String(req.params.id), 10);

      const result = await friendsService.declineFriendRequest(userId, requestId);

      res.status(200).json({
        success: true,
        message: 'Friend request declined',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Удалить из друзей
router.delete(
  '/:id',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const initiatorId = req.user!.userId;
      const targetId = parseInt(String(req.params.id), 10);

      const result = await friendsService.removeFriend(initiatorId, targetId);

      res.status(200).json({
        success: true,
        message: 'Friend removed and moved to following',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Получить агрегированный статус отношений с пользователем
router.get(
  '/:id/relation',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const viewerId = req.user!.userId;
      const targetId = parseInt(String(req.params.id), 10);
      const relation = await friendsService.getRelation(viewerId, targetId);

      res.status(200).json({
        success: true,
        ...relation,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Проверить, являются ли пользователи друзьями
router.get(
  '/me/is-friends/:id',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const userId1 = req.user!.userId;
      const userId2 = parseInt(String(req.params.id), 10);

      const areFriends = await friendsService.areFriends(userId1, userId2);

      res.status(200).json({
        success: true,
        areFriends,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== ПУБЛИЧНЫЕ ЭНДПОИНТЫ ====================

// Получить друзей пользователя по id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const friendsService = new FriendsService(prisma);

    const userId = parseInt(String(req.params.id), 10);
    const result = await friendsService.getFriends(userId, parsePaginationQuery(req.query));

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// Количество друзей пользователя
router.get(
  '/:id/count',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const friendsService = new FriendsService(prisma);

      const userId = parseInt(String(req.params.id), 10);
      const result = await friendsService.getFriendsCount(userId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;