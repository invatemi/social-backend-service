import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { AuthService, UserRegistrationData, UserLoginData } from './auth.service';
import {
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
  setAccountSessionCookie,
  clearAccountSessionCookie,
  getAccountSessionFromRequest,
} from '../../middleware/cookie-options';
import { InvalidRefreshTokenError, ValidationError } from './auth.errors';

const router = Router();

interface AuthRequest extends Request {
  prisma?: PrismaClient;
}

/** Создаёт сервис аутентификации из контекста запроса. */
const getAuthService = (req: AuthRequest): AuthService => {
  if (!req.prisma) {
    throw new Error('PrismaClient is not attached to request');
  }
  return new AuthService(req.prisma);
};

router.post('/register', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { username, email, password } = req.body;
    const result = await getAuthService(req).registerUser({ username, email, password } as UserRegistrationData);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await getAuthService(req).login({ email, password } as UserLoginData);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw new InvalidRefreshTokenError('Refresh token is required');
    }

    const tokens = await getAuthService(req).refreshAccessToken(refreshToken);
    setRefreshCookie(res, tokens.refreshToken);
    res.status(200).json({
      accessToken: tokens.accessToken,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    const accountSession = getAccountSessionFromRequest(req);
    const result = await getAuthService(req).logoutWithVault(refreshToken, accountSession);

    if (result.switched && result.session) {
      setRefreshCookie(res, result.session.refreshToken);
      if (result.accountSessionToken) {
        setAccountSessionCookie(res, result.accountSessionToken);
      }
      res.status(200).json({
        switched: true,
        accessToken: result.session.accessToken,
        user: result.session.user,
        accounts: result.accounts ?? [],
      });
      return;
    }

    clearRefreshCookie(res);
    clearAccountSessionCookie(res);
    res.status(200).json({ message: 'Logged out successfully', switched: false });
  } catch (error) {
    next(error);
  }
});

router.post('/accounts/add', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw new InvalidRefreshTokenError('Refresh token is required');
    }

    const { email, password } = req.body;
    const accountSession = getAccountSessionFromRequest(req);
    const result = await getAuthService(req).addAccount(
      refreshToken,
      accountSession,
      { email, password } as UserLoginData,
    );

    setRefreshCookie(res, result.refreshToken);
    setAccountSessionCookie(res, result.accountSessionToken);

    res.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
      accounts: result.accounts,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/accounts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw new InvalidRefreshTokenError('Refresh token is required');
    }

    const accountSession = getAccountSessionFromRequest(req);
    const accounts = await getAuthService(req).listAccounts(refreshToken, accountSession);
    res.status(200).json({ accounts });
  } catch (error) {
    next(error);
  }
});

router.post('/accounts/switch', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw new InvalidRefreshTokenError('Refresh token is required');
    }

    const rawUserId = req.body?.userId;
    const userId = typeof rawUserId === 'number' ? rawUserId : Number.parseInt(String(rawUserId), 10);
    if (!Number.isInteger(userId)) {
      throw new ValidationError('userId must be a positive integer', 'userId');
    }

    const accountSession = getAccountSessionFromRequest(req);
    const result = await getAuthService(req).switchAccount(
      refreshToken,
      accountSession,
      userId,
    );

    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
      accounts: result.accounts,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/jwks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(200).json(getAuthService(req).getJwks());
  } catch (error) {
    next(error);
  }
});

export default router;
