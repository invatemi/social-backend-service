import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  CommentError,
  ValidationError as CommentValidationError,
  CommentNotFoundError,
  PostNotFoundError as CommentPostNotFoundError,
  ForbiddenError as CommentForbiddenError,
  UnauthorizedError as CommentUnauthorizedError,
  CommentDeletedError,
} from '../routes/comment/comment.errors';

import {
  PostError,
  PostValidationError,
  PostNotFoundError,
  PostForbiddenError,
  UnauthorizedError as PostUnauthorizedError,
  PostAlreadyPublishedError,
  PostAlreadyDraftError,
} from '../routes/post/post.errors';

/** Преобразует ошибки постов и комментариев в HTTP-ответы. */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[${req.method} ${req.path}]`, err.message);

  let errorCode = 'UNKNOWN_ERROR';
  let errorMessage = 'An error occurred';
  let errorField: string | null = null;
  let statusCode = 500;

  if (err instanceof ZodError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.issues[0]?.message ?? 'Invalid request data';
    errorField = err.issues[0]?.path.join('.') || null;
  }
  // ==================== COMMENT ERRORS ====================
  else if (err instanceof CommentValidationError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
    errorField = err.field ?? null;
  } else if (err instanceof CommentNotFoundError) {
    statusCode = 404;
    errorCode = 'COMMENT_NOT_FOUND';
    errorMessage = err.message;
  } else if (err instanceof CommentPostNotFoundError) {
    statusCode = 404;
    errorCode = 'POST_NOT_FOUND';
    errorMessage = err.message;
  } else if (err instanceof CommentForbiddenError) {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    errorMessage = err.message;
  } else if (err instanceof CommentUnauthorizedError) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    errorMessage = err.message;
  } else if (err instanceof CommentDeletedError) {
    statusCode = 410;
    errorCode = 'COMMENT_DELETED';
    errorMessage = err.message;
  }
  
  // ==================== POST ERRORS ====================
  else if (err instanceof PostValidationError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
    errorField = err.field ?? null;
  } else if (err instanceof PostNotFoundError) {
    statusCode = 404;
    errorCode = 'POST_NOT_FOUND';
    errorMessage = err.message;
  } else if (err instanceof PostForbiddenError) {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    errorMessage = err.message;
  } else if (err instanceof PostUnauthorizedError) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    errorMessage = err.message;
  } else if (err instanceof PostAlreadyPublishedError) {
    statusCode = 409;
    errorCode = 'POST_ALREADY_PUBLISHED';
    errorMessage = err.message;
  } else if (err instanceof PostAlreadyDraftError) {
    statusCode = 409;
    errorCode = 'POST_ALREADY_DRAFT';
    errorMessage = err.message;
  }
  
  // ==================== BASE ERRORS ====================
  else if (err instanceof CommentError) {
    statusCode = 400;
    errorCode = 'COMMENT_ERROR';
    errorMessage = err.message;
  } else if (err instanceof PostError) {
    statusCode = 400;
    errorCode = 'POST_ERROR';
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