import { Request, Response, NextFunction } from 'express';

/** Converts invalid JSON bodies to a client error response. */
export const jsonErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('[JSON Parse Error]', err.message);
    return res.status(400).json({
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