import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../../generated/prisma';
import { KrakenDRequest, krakendAuthMiddleware } from '../../middleware/krakend-auth';
import { ProfileService } from './profile.service';

const router = Router();

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(30).optional(),
    email: z.string().trim().email().max(100).optional(),
    avatarUrl: z.string().trim().url().nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    location: z.string().trim().max(100).nullable().optional(),
  })
  .strict();

router.patch(
  '/me',
  krakendAuthMiddleware,
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

export default router;
