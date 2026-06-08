import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../generated/prisma';
import { AuthService, UserRegistrationData, UserLoginData } from './auth.service';

const router = Router();

interface AuthRequest extends Request {
  prisma?: PrismaClient;
}

const getAuthService = (req: AuthRequest): AuthService => {
  if (!req.prisma) {
    throw new Error('PrismaClient is not attached to request');
  }

  return new AuthService(req.prisma);
};

router.post('/register', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authService = getAuthService(req);
    
    const { username, email, password } = req.body;
    const result = await authService.registerUser({ username, email, password } as UserRegistrationData);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authService = getAuthService(req);
    
    const { email, password } = req.body;
    const result = await authService.login({ email, password } as UserLoginData);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authService = getAuthService(req);
    
    const { refreshToken } = req.body;
    const tokens = await authService.refreshAccessToken(refreshToken);

    res.status(200).json(tokens);
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authService = getAuthService(req);
    
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;