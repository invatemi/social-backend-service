import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  MessageError,
  MessageValidationError,
  ChatNotFoundError,
  MessageNotFoundError,
  MessageForbiddenError,
  UnauthorizedError,
} from '../routes/message/message.errors';

/** Преобразует ошибки messaging в HTTP-ответы. */
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[${req.method} ${req.path}]`, err.message);

  let errorCode = 'UNKNOWN_ERROR';
  let errorMessage = 'An error occurred';
  let errorField: string | null = null;
  let statusCode = 500;

  const zodIssues =
    err instanceof ZodError
      ? err.issues
      : err.name === 'ZodError' && Array.isArray((err as ZodError).issues)
        ? (err as ZodError).issues
        : null;

  if (zodIssues) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = zodIssues[0]?.message ?? 'Invalid request data';
    errorField = zodIssues[0]?.path?.join('.') || null;
  } else if (err instanceof MessageValidationError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
    errorField = err.field ?? null;
  } else if (err instanceof ChatNotFoundError) {
    statusCode = 404;
    errorCode = 'CHAT_NOT_FOUND';
    errorMessage = err.message;
  } else if (err instanceof MessageNotFoundError) {
    statusCode = 404;
    errorCode = 'MESSAGE_NOT_FOUND';
    errorMessage = err.message;
  } else if (err instanceof MessageForbiddenError) {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    errorMessage = err.message;
  } else if (err instanceof UnauthorizedError) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    errorMessage = err.message;
  } else if (err instanceof MessageError) {
    statusCode = 400;
    errorCode = 'MESSAGE_ERROR';
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
