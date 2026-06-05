import { Request, Response, NextFunction } from "express";

export interface KrakenDRequest extends Request {
  user?: { userId: number; role?: string };
}

/**
 * Middleware для извлечения данных пользователя из заголовков, 
 * которые передал KrakenD
 */
export const krakendAuthMiddleware = (req: KrakenDRequest, res: Response, next: NextFunction) => {
    const userIdStr = req.headers['x-user-id'] as string;


  if (!userIdStr) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized: Missing user context from gateway' 
    });
  }

  const userId = parseInt(userIdStr, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Bad Request: Invalid user ID format' 
    });
  }
  const role = req.headers['x-user-role'] as string | undefined;
  req.user = { userId, role };

  next();
}