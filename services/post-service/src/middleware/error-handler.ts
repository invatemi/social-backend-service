import { Request, Response, NextFunction } from 'express';
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

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[${req.method} ${req.path}]`, err.message);

  let errorCode = 'UNKNOWN_ERROR';
  let errorMessage = 'An error occurred';
  let errorField = null;

  // ==================== COMMENT ERRORS ====================
  if (err instanceof CommentValidationError) {
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
    errorField = err.field;
  } else if (err instanceof CommentNotFoundError) {
    errorCode = 'COMMENT_NOT_FOUND';
    errorMessage = err.message;
  } else if (err instanceof CommentPostNotFoundError) {
    errorCode = 'POST_NOT_FOUND';
    errorMessage = err.message;
  } else if (err instanceof CommentForbiddenError) {
    errorCode = 'FORBIDDEN';
    errorMessage = err.message;
  } else if (err instanceof CommentUnauthorizedError) {
    errorCode = 'UNAUTHORIZED';
    errorMessage = err.message;
  } else if (err instanceof CommentDeletedError) {
    errorCode = 'COMMENT_DELETED';
    errorMessage = err.message;
  }
  
  // ==================== POST ERRORS ====================
  else if (err instanceof PostValidationError) {
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
    errorField = err.field;
  } else if (err instanceof PostNotFoundError) {
    errorCode = 'POST_NOT_FOUND';
    errorMessage = err.message;
  } else if (err instanceof PostForbiddenError) {
    errorCode = 'FORBIDDEN';
    errorMessage = err.message;
  } else if (err instanceof PostUnauthorizedError) {
    errorCode = 'UNAUTHORIZED';
    errorMessage = err.message;
  } else if (err instanceof PostAlreadyPublishedError) {
    errorCode = 'POST_ALREADY_PUBLISHED';
    errorMessage = err.message;
  } else if (err instanceof PostAlreadyDraftError) {
    errorCode = 'POST_ALREADY_DRAFT';
    errorMessage = err.message;
  }
  
  // ==================== BASE ERRORS ====================
  else if (err instanceof CommentError) {
    errorCode = 'COMMENT_ERROR';
    errorMessage = err.message;
  } else if (err instanceof PostError) {
    errorCode = 'POST_ERROR';
    errorMessage = err.message;
  }

  res.status(200).json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      field: errorField,
    },
  });
};