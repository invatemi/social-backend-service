import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../../generated/prisma';
import { KrakenDRequest, userContextMiddleware } from '../../middleware/krakend-auth';
import { serviceAuthMiddleware } from '../../middleware/service-auth';
import { ProfileService } from './profile.service';
import { parsePaginationQuery } from '../../utils/pagination';

const router = Router();

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(30).optional(),
    email: z.string().trim().email().max(100).optional(),
    avatarUrl: z.string().trim().url().nullable().optional(),
    coverUrl: z.string().trim().url().nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    location: z.string().trim().max(100).nullable().optional(),
  })
  .strict();

const avatarUploadUrlQuerySchema = z
  .object({
    contentType: z.string().trim().startsWith('image/').max(100).optional(),
    fileName: z.string().trim().max(120).optional(),
  })
  .strict();

const authorsBatchSchema = z
  .object({
    userIds: z.array(z.number().int().positive()).max(50),
  })
  .strict();

const feedSourcesSchema = z
  .object({
    userId: z.number().int().positive(),
  })
  .strict();

router.get(
  '/me',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const profileService = new ProfileService(prisma);
      const user = await profileService.getProfile(req.user!.userId);

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/me',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const profileService = new ProfileService(prisma);
      const input = updateProfileSchema.parse(req.body);

      const result = await profileService.updateProfile(req.user!.userId, input);

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
  '/me/avatar-upload-url',
  userContextMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const prisma = (req as any).prisma as PrismaClient;
      const profileService = new ProfileService(prisma);
      const input = avatarUploadUrlQuerySchema.parse(req.query);
      const result = await profileService.getAvatarUploadUrl(req.user!.userId, input);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.use('/internal', serviceAuthMiddleware);

router.post('/internal/post-audience', async (req: KrakenDRequest, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const profileService = new ProfileService(prisma);
    const { userId } = feedSourcesSchema.parse(req.body);
    const userIds = await profileService.getPostAudienceUserIds(userId);

    res.status(200).json({
      success: true,
      userIds,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/internal/feed-sources', async (req: KrakenDRequest, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const profileService = new ProfileService(prisma);
    const { userId } = feedSourcesSchema.parse(req.body);
    const userIds = await profileService.getFeedSourceUserIds(userId);

    res.status(200).json({
      success: true,
      userIds,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/internal/authors', async (req: KrakenDRequest, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const profileService = new ProfileService(prisma);
    const { userIds } = authorsBatchSchema.parse(req.body);
    const authors = await profileService.getAuthorsByIds(userIds);

    res.status(200).json({
      success: true,
      authors,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req: KrakenDRequest, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const profileService = new ProfileService(prisma);
    const result = await profileService.searchUsers(req.query.q, parsePaginationQuery(req.query));

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: KrakenDRequest, res: Response, next: NextFunction) => {
  try {
    const prisma = (req as any).prisma as PrismaClient;
    const profileService = new ProfileService(prisma);
    const userId = parseInt(String(req.params.id), 10);
    const user = await profileService.getProfile(userId);

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
