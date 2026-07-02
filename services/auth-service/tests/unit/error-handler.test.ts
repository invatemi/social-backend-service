import type { Request, Response } from 'express';
import { errorHandler } from '../../src/middleware/error-handler';
import { ValidationError } from '../../src/routes/auth/auth.errors';

const createRes = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
};

describe('errorHandler unit', () => {
  it('маппит ValidationError в 400', () => {
    const req = { method: 'POST', path: '/api/auth/register' } as Request;
    const res = createRes() as unknown as Response;

    errorHandler(new ValidationError('Invalid email format', 'email'), req, res, jest.fn());

    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
    expect((res.status as jest.Mock).mock.results[0].value.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid email format',
        field: 'email',
      },
    });
  });

  it('маппит неизвестную ошибку в 500', () => {
    const req = { method: 'GET', path: '/api/auth/jwks' } as Request;
    const res = createRes() as unknown as Response;

    errorHandler(new Error('boom'), req, res, jest.fn());

    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(500);
    expect((res.status as jest.Mock).mock.results[0].value.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'An error occurred',
        field: null,
      },
    });
  });
});
