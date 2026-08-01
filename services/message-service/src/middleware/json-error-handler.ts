import { Request, Response, NextFunction } from 'express';

/** Converts invalid JSON bodies to a client error response. */
export const jsonErrorHandler = (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large',
        field: null,
      },
    });
  }

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
