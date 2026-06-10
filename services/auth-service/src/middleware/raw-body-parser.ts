import { Request, Response, NextFunction } from 'express';

/** Parses a raw JSON body when no JSON middleware body exists. */
export const rawBodyParser = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    return next();
  }

  if (req.body && Object.keys(req.body).length > 0) {
    return next();
  }

  let rawData = '';
  req.on('data', (chunk) => {
    rawData += chunk.toString();
  });

  req.on('end', () => {
    if (rawData) {
      try {
        req.body = JSON.parse(rawData);
      } catch (error) {
        console.error('[Raw Body Parser] Failed to parse JSON');
        req.body = {};
      }
    }
    next();
  });

  req.on('error', (error) => {
    console.error('[Raw Body Parser] Error reading body:', error);
    next(error);
  });
};