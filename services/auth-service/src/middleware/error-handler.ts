import { Request, Response, NextFunction } from 'express';
import {
  AuthError,
  ValidationError,
  UserAlreadyExistsError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  ForbiddenError,
  InvalidAccountSessionError,
  AccountAlreadyLinkedError,
  AccountNotLinkedError,
} from '../routes/auth/auth.errors';

/** Преобразует ошибки аутентификации в HTTP-ответы. */
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
  let statusCode = 500;

  if (err instanceof ValidationError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
    errorField = err.field;
  } else if (err instanceof UserAlreadyExistsError) {
    statusCode = 409;
    errorCode = 'USER_EXISTS';
    errorMessage = err.message;
  } else if (err instanceof AccountAlreadyLinkedError) {
    statusCode = 409;
    errorCode = err.code;
    errorMessage = err.message;
  } else if (err instanceof AccountNotLinkedError) {
    statusCode = 404;
    errorCode = err.code;
    errorMessage = err.message;
  } else if (err instanceof InvalidCredentialsError) {
    statusCode = 401;
    errorCode = 'INVALID_CREDENTIALS';
    errorMessage = err.message;
  } else if (err instanceof InvalidRefreshTokenError) {
    statusCode = 401;
    errorCode = 'INVALID_REFRESH_TOKEN';
    errorMessage = err.message;
  } else if (err instanceof InvalidAccountSessionError) {
    statusCode = 401;
    errorCode = err.code;
    errorMessage = err.message;
  } else if (err instanceof ForbiddenError) {
    statusCode = 403;
    errorCode = err.code;
    errorMessage = err.message;
  } else if (err instanceof AuthError) {
    statusCode = 400;
    errorCode = 'AUTH_ERROR';
    errorMessage = err.message;
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      field: errorField,
    },
  });
};
