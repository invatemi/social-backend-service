import { Request, Response, NextFunction } from 'express';

/** Возвращает ошибку при невалидном JSON в теле запроса. */
export const jsonErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Невалидный JSON в теле запроса',
        field: null,
      },
    });
  }
  next(err);
};
