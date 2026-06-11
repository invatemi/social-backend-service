import { Router, Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '../../generated/prisma';
import { CommentService } from './comment.service';
import { KrakenDRequest, krakendAuthMiddleware } from '../../middleware/krakend-auth';

const router = Router();

// ==================== ЗАЩИЩЁННЫЕ ЭНДПОИНТЫ ====================

// Создать комментарий
router.post(
  '/',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const commentService = new CommentService(prisma);

      const userId = req.user!.userId;
      const { postId, content } = req.body;

      const comment = await commentService.createComment({
        postId,
        userId,
        content,
      });

      res.status(200).json({
        success: true,
        comment,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Обновить комментарий
router.put(
  '/:id',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const commentService = new CommentService(prisma);

      const commentId = parseInt(String(req.params.id), 10);
      const userId = req.user!.userId;
      const { content } = req.body;

      const comment = await commentService.updateComment(commentId, userId, { content });

      res.status(200).json({
        success: true,
        comment,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Удалить комментарий
router.delete(
  '/:id',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const commentService = new CommentService(prisma);

      const commentId = parseInt(String(req.params.id), 10);
      const userId = req.user!.userId;

      await commentService.deleteComment(commentId, userId);

      res.status(200).json({
        success: true,
        message: 'Comment deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== ПУБЛИЧНЫЕ ЭНДПОИНТЫ ====================

// Получить все комментарии к посту
router.get(
  '/post/:postId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const commentService = new CommentService(prisma);

      const postId = parseInt(String(req.params.postId), 10);
      const result = await commentService.getCommentsByPost(postId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Получить комментарий по ID
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const commentService = new CommentService(prisma);

      const commentId = parseInt(String(req.params.id), 10);
      const comment = await commentService.getCommentById(commentId);

      res.status(200).json({
        success: true,
        comment,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Получить количество комментариев к посту
router.get(
  '/post/:postId/count',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const commentService = new CommentService(prisma);

      const postId = parseInt(String(req.params.postId), 10);
      const result = await commentService.getCommentsCount(postId);

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