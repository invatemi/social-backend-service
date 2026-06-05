import { Request, Response, NextFunction } from 'express';

export const jsonErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('[JSON Parse Error]', err.message);
    return res.status(200).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
        field: null,
      },
    });
  }
  next(err);
};