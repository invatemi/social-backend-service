import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma';
import { KrakenDRequest, krakendAuthMiddleware } from '../../middleware/krakend-auth';
import { PasswordService } from './password.service';

const router = Router();

const verifyPasswordSchema = z
  .object({
    code: z.string().trim().regex(/^\d{4}$/, 'Code must be 4 digits'),
    newPassword: z.string().trim().min(8, 'Password must be at least 8 characters'),
  })
  .strict();

const getPasswordService = (req: KrakenDRequest): PasswordService => {
  const prisma = (req as KrakenDRequest & { prisma?: PrismaClient }).prisma as PrismaClient;
  const authPool = (req as KrakenDRequest & { authPool?: Pool }).authPool as Pool;
  return new PasswordService(prisma, authPool);
};

router.post(
  '/me/password/request',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const passwordService = getPasswordService(req);
      const result = await passwordService.requestPasswordChangeCode(req.user!.userId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/me/password/verify',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res: Response, next: NextFunction) => {
    try {
      const input = verifyPasswordSchema.parse(req.body);
      const passwordService = getPasswordService(req);
      const result = await passwordService.verifyCodeAndChangePassword(
        req.user!.userId,
        input.code,
        input.newPassword
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

export default router;
