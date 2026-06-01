import { Request, Response, NextFunction } from 'express';
import { AuthError, ValidationError, UserAlreadyExistsError, InvalidCredentialsError, InvalidRefreshTokenError } from '../routes/auth.errors';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[${req.method} ${req.path}]`, err);

  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message, field: err.field });
  }
  if (err instanceof UserAlreadyExistsError) {
    return res.status(409).json({ error: err.message });
  }
  if (err instanceof InvalidCredentialsError) {
    return res.status(401).json({ error: err.message });
  }
  if (err instanceof InvalidRefreshTokenError) {
    return res.status(401).json({ error: err.message });
  }
  if (err instanceof AuthError) {
    return res.status(403).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error' });
};