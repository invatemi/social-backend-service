import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../generated/prisma/client';
import { FollowersService } from './followers.service';
import { KrakenDRequest, krakendAuthMiddleware } from '../../middleware/krakend-auth';

const router = Router();

// ==================== ЗАЩИЩЁННЫЕ ЭНДПОИНТЫ ====================

// Мои подписчики
router.get(
  '/me/followers',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const followersService = new FollowersService(prisma);

      const userId = req.user!.userId;
      const result = await followersService.getFollowers(userId);

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

// Мои подписки
router.get(
  '/me/following',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const followersService = new FollowersService(prisma);

      const userId = req.user!.userId;
      const result = await followersService.getFollowing(userId);

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

// Проверить, подписан ли я на пользователя
router.get(
  '/me/is-following/:id',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const followersService = new FollowersService(prisma);

      const followerId = req.user!.userId;
      const followingId = parseInt(String(req.params.id), 10);

      const isFollowing = await followersService.isFollowing(followerId, followingId);

      res.status(200).json({ success: true, isFollowing });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== ПУБЛИЧНЫЕ ЭНДПОИНТЫ ====================

// Получить подписчиков пользователя
router.get('/:id/followers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const followersService = new FollowersService(prisma);
    const userId = parseInt(String(req.params.id), 10);
    const result = await followersService.getFollowers(userId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Получить подписки пользователя (на кого подписан)
router.get('/:id/following', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const followersService = new FollowersService(prisma);
    const userId = parseInt(String(req.params.id), 10);
    const result = await followersService.getFollowing(userId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Получить количество подписчиков и подписок
router.get('/:id/counts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const followersService = new FollowersService(prisma);
    const userId = parseInt(String(req.params.id), 10);
    const counts = await followersService.getCounts(userId);
    res.status(200).json({ success: true, ...counts });
  } catch (error) {
    next(error);
  }
});

// Подписаться на пользователя
router.post(
  '/:id/follow',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const followersService = new FollowersService(prisma);

      const followerId = req.user!.userId;
      const followingId = parseInt(String(req.params.id), 10);

      await followersService.followUser(followerId, followingId);

      res.status(200).json({ success: true, message: 'Successfully followed user' });
    } catch (error) {
      next(error);
    }
  }
);

// Отписаться от пользователя
router.delete(
  '/:id/follow',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const followersService = new FollowersService(prisma);

      const followerId = req.user!.userId;
      const followingId = parseInt(String(req.params.id), 10);

      await followersService.unfollowUser(followerId, followingId);

      res.status(200).json({ success: true, message: 'Successfully unfollowed user' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;