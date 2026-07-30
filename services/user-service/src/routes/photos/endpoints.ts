import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../../generated/prisma';
import { KrakenDRequest, userContextMiddleware } from '../../middleware/krakend-auth';
import { PhotosService } from './photos.service';

const createCommentSchema = z
  .object({
    content: z.string().trim().min(1).max(2000),
  })
  .strict();

/** Routes mounted at /api/users — list gallery photos. */
export const userPhotosRouter = Router();

userPhotosRouter.get(
  '/me/photos',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const photosService = new PhotosService(prisma);
      const photos = await photosService.listUserPhotos(req.user!.userId, req.user!.userId);

      res.status(200).json({
        success: true,
        photos,
      });
    } catch (error) {
      next(error);
    }
  }
);

userPhotosRouter.get(
  '/:id/photos',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const photosService = new PhotosService(prisma);
      const userId = parseInt(String(req.params.id), 10);
      const photos = await photosService.listUserPhotos(userId, req.user!.userId);

      res.status(200).json({
        success: true,
        photos,
      });
    } catch (error) {
      next(error);
    }
  }
);

/** Routes mounted at /api/photos — delete / like / comments. */
export const photosRouter = Router();

photosRouter.delete(
  '/:id',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const photosService = new PhotosService(prisma);
      const result = await photosService.deletePhoto(req.params.id, req.user!.userId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

photosRouter.post(
  '/:id/like',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const photosService = new PhotosService(prisma);
      const result = await photosService.toggleLike(req.params.id, req.user!.userId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

photosRouter.get(
  '/:id/comments',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const photosService = new PhotosService(prisma);
      const result = await photosService.getComments(req.params.id);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

photosRouter.post(
  '/:id/comments',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const photosService = new PhotosService(prisma);
      const { content } = createCommentSchema.parse(req.body);
      const comment = await photosService.createComment(
        req.params.id,
        req.user!.userId,
        content
      );

      res.status(201).json({
        success: true,
        comment,
      });
    } catch (error) {
      next(error);
    }
  }
);

photosRouter.delete(
  '/:id/comments/:commentId',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const photosService = new PhotosService(prisma);
      const result = await photosService.deleteComment(
        req.params.id,
        req.params.commentId,
        req.user!.userId
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
