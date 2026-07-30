import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma';
import { PostService } from './post.service';
import { KrakenDRequest, krakendAuthMiddleware } from '../../middleware/krakend-auth';

const router = Router();

const imageUploadUrlQuerySchema = z
  .object({
    contentType: z.string().trim().startsWith('image/').max(100).optional(),
    fileName: z.string().trim().max(120).optional(),
  })
  .strict();

// ==================== ЗАЩИЩЁННЫЕ ЭНДПОИНТЫ ====================

// Presigned URL для загрузки изображения поста
router.get(
  '/me/image-upload-url',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);
      const input = imageUploadUrlQuerySchema.parse(req.query);
      const result = await postService.getImageUploadUrl(req.user!.userId, input);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Создать пост
router.post(
  '/',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const userId = req.user!.userId;
      const { title, content, imageUrl, isPublished } = req.body;

      const post = await postService.createPost({
        userId,
        title,
        content,
        imageUrl,
        isPublished,
      });

      res.status(200).json({
        success: true,
        post,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Мои посты (включая черновики)
router.get(
  '/me',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const userId = req.user!.userId;
      const page = parseInt(String(req.query.page || '1'), 10);
      const pageSize = parseInt(String(req.query.pageSize || '10'), 10);

      const result = await postService.getMyPosts(userId, { page, pageSize });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Обновить пост
router.put(
  '/:id',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const postId = parseInt(String(req.params.id), 10);
      const userId = req.user!.userId;
      const { title, content, imageUrl } = req.body;

      const post = await postService.updatePost(postId, userId, {
        title,
        content,
        imageUrl,
      });

      res.status(200).json({
        success: true,
        post,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Удалить пост
router.delete(
  '/:id',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const postId = parseInt(String(req.params.id), 10);
      const userId = req.user!.userId;

      await postService.deletePost(postId, userId);

      res.status(200).json({
        success: true,
        message: 'Post deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// Опубликовать пост
router.post(
  '/:id/publish',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const postId = parseInt(String(req.params.id), 10);
      const userId = req.user!.userId;

      const post = await postService.publishPost(postId, userId);

      res.status(200).json({
        success: true,
        post,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Снять с публикации (сделать черновиком)
router.post(
  '/:id/unpublish',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const postId = parseInt(String(req.params.id), 10);
      const userId = req.user!.userId;

      const post = await postService.unpublishPost(postId, userId);

      res.status(200).json({
        success: true,
        post,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Поставить или убрать лайк
router.post(
  '/:id/like',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const postId = parseInt(String(req.params.id), 10);
      const userId = req.user!.userId;

      const result = await postService.toggleLike(postId, userId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/feed",
  krakendAuthMiddleware, 
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const postService = new PostService(prisma);

    const userId = req.user!.userId;
    const page = parseInt(String(req.query.page || '1'), 10);
    const pageSize = parseInt(String(req.query.pageSize || '10'), 10);

    const result = await postService.getFeed(userId, {
      page,
      pageSize,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
})

// ==================== ПУБЛИЧНЫЕ ЭНДПОИНТЫ ====================

// Получить все опубликованные посты (лента)
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const page = parseInt(String(req.query.page || '1'), 10);
      const pageSize = parseInt(String(req.query.pageSize || '10'), 10);

      const result = await postService.getAllPosts({
        page,
        pageSize,
        onlyPublished: true,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Получить посты пользователя
router.get(
  '/user/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const userId = parseInt(String(req.params.userId), 10);
      const page = parseInt(String(req.query.page || '1'), 10);
      const pageSize = parseInt(String(req.query.pageSize || '10'), 10);

      const result = await postService.getPostsByUser(userId, {
        page,
        pageSize,
        onlyPublished: true,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Получить пост по ID
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const postService = new PostService(prisma);

      const postId = parseInt(String(req.params.id), 10);
      const post = await postService.getPostById(postId);

      res.status(200).json({
        success: true,
        post,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;