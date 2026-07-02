import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { errorHandler } from '../../src/middleware/error-handler';

const createRes = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
};

describe('notifications errorHandler', () => {
  it('возвращает 400 для ZodError', () => {
    const req = { method: 'PATCH', path: '/api/notifications/1/read' } as Request;
    const res = createRes() as unknown as Response;
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'number',
        received: 'string',
        path: ['id'],
        message: 'Invalid input',
      } as any,
    ]);

    errorHandler(zodError, req, res, jest.fn());

    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
    expect((res.status as jest.Mock).mock.results[0].value.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Ошибка валидации',
        field: 'id',
      },
    });
  });

  it('возвращает 500 для неизвестной ошибки', () => {
    const req = { method: 'GET', path: '/api/notifications' } as Request;
    const res = createRes() as unknown as Response;

    errorHandler(new Error('boom'), req, res, jest.fn());

    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(500);
  });
});
