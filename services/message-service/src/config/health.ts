import type { Request, Response } from 'express';

/** Формирует обработчик эндпоинта /health. */
export const createHealthHandler = (
  serviceName: string,
  checkDatabase: () => Promise<boolean>
) => {
  return async (_req: Request, res: Response): Promise<void> => {
    const isHealthy = await checkDatabase();

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'degraded',
      service: serviceName,
      database: isHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  };
};
