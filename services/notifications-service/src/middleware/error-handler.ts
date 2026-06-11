import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/** Преобразует ошибки домена уведомлений в HTTP-ответы. */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(`[${req.method} ${req.path}]`, err.message);

  const isValidationError = err instanceof ZodError;

  res.status(isValidationError ? 400 : 500).json({
    success: false,
    error: {
      code: isValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: isValidationError ? 'Ошибка валидации' : 'Внутренняя ошибка сервера',
      field: isValidationError ? err.issues[0]?.path.join('.') ?? null : null,
    },
  });
};
