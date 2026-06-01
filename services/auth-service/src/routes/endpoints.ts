import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../generated/prisma';
import { AuthService, UserRegistrationData, UserLoginData } from './auth.service';

const router = Router();

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  const prisma = (req as any).prisma as PrismaClient;
  const authService = new AuthService(prisma);
  
  const { email, password, name } = req.body;
  const result = await authService.registerUser({ email, password, name } as UserRegistrationData);

  res.status(201).json({
    message: result.message,
    user: result.user,
    ...result.tokens,
  });
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  const prisma = (req as any).prisma as PrismaClient;
  const authService = new AuthService(prisma);
  
  const { email, password } = req.body;
  const result = await authService.login({ email, password } as UserLoginData);

  res.json({
    user: result.user,
    ...result.tokens,
  });
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  const prisma = (req as any).prisma as PrismaClient;
  const authService = new AuthService(prisma);
  
  const { refreshToken } = req.body;
  const tokens = await authService.refreshAccessToken(refreshToken);

  res.json(tokens);
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  const prisma = (req as any).prisma as PrismaClient;
  const authService = new AuthService(prisma);
  
  const { refreshToken } = req.body;
  await authService.logout(refreshToken);
  
  res.status(204).send();
});

export default router;