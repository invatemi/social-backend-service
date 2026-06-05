import { Request, Response, NextFunction } from 'express';
import { AuthError, ValidationError, UserAlreadyExistsError, InvalidCredentialsError, InvalidRefreshTokenError } from '../routes/auth.errors';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[${req.method} ${req.path}]`, err.message);

  let errorCode = 'UNKNOWN_ERROR';
  let errorMessage = 'An error occurred';
  let errorField = null;

  if (err instanceof ValidationError) {
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
    errorField = err.field;
  } else if (err instanceof UserAlreadyExistsError) {
    errorCode = 'USER_EXISTS';
    errorMessage = err.message;
  } else if (err instanceof InvalidCredentialsError) {
    errorCode = 'INVALID_CREDENTIALS';
    errorMessage = err.message;
  } else if (err instanceof InvalidRefreshTokenError) {
    errorCode = 'INVALID_REFRESH_TOKEN';
    errorMessage = err.message;
  } else if (err instanceof AuthError) {
    errorCode = 'AUTH_ERROR';
    errorMessage = err.message;
  }

  res.status(200).json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      field: errorField,
    },
  });
};