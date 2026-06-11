import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

import {
  UserError,
  ValidationError as FollowersValidationError,
  UserNotFoundError as FollowersUserNotFoundError,
  SelfFollowError,
  AlreadyFollowingError,
  NotFollowingError,
  UnauthorizedError as FollowersUnauthorizedError,
  ForbiddenError,
} from '../routes/followers/followers.errors';

import {
  FriendError,
  ValidationError as FriendsValidationError,
  UserNotFoundError as FriendsUserNotFoundError,
  SelfFriendError,
  NotFriendsError,
  AlreadyFriendsError,
  FriendRequestAlreadyExistsError,
  FriendRequestNotFoundError,
  UnauthorizedError as FriendsUnauthorizedError,
} from '../routes/friends/friends.errors';
import { PaginationValidationError } from '../utils/pagination';
import { AvatarUploadConfigurationError } from '../routes/profile/profile.service';
import { MailConfigurationError } from '../lib/mailer';
import { PasswordError } from '../routes/password/password.errors';

/** Преобразует ошибки user-домена в HTTP-ответы. */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[${req.method} ${req.path}]`, err.message);

  let errorCode = 'UNKNOWN_ERROR';
  let errorMessage = 'An error occurred';
  let errorField: string | null | undefined = null;
  let statusCode = 500;

  //Ошибки валидации
  if (err instanceof ZodError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.issues[0]?.message ?? 'Invalid request data';
    errorField = err.issues[0]?.path.join('.') ?? null;
  }
  else if (
    err instanceof FollowersValidationError ||
    err instanceof FriendsValidationError ||
    err instanceof PaginationValidationError
  ) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
    errorField = err.field;
  } 
  //Пользователь не найден
  else if (err instanceof FollowersUserNotFoundError || err instanceof FriendsUserNotFoundError) {
    statusCode = 404;
    errorCode = 'USER_NOT_FOUND';
    errorMessage = err.message;
  } 
  //Специфичные ошибки модуля followers
  else if (err instanceof SelfFollowError) {
    statusCode = 400;
    errorCode = 'SELF_FOLLOW';
    errorMessage = err.message;
  } 
  else if (err instanceof AlreadyFollowingError) {
    statusCode = 409;
    errorCode = 'ALREADY_FOLLOWING';
    errorMessage = err.message;
  } 
  else if (err instanceof NotFollowingError) {
    statusCode = 404;
    errorCode = 'NOT_FOLLOWING';
    errorMessage = err.message;
  } 
  //Специфичные ошибки модуля friends
  else if (err instanceof SelfFriendError) {
    statusCode = 400;
    errorCode = 'SELF_FRIEND';
    errorMessage = err.message;
  } 
  else if (err instanceof NotFriendsError) {
    statusCode = 404;
    errorCode = 'NOT_FRIENDS';
    errorMessage = err.message;
  } 
  else if (err instanceof AlreadyFriendsError) {
    statusCode = 409;
    errorCode = 'ALREADY_FRIENDS';
    errorMessage = err.message;
  } 
  else if (err instanceof FriendRequestAlreadyExistsError) {
    statusCode = 409;
    errorCode = 'FRIEND_REQUEST_ALREADY_EXISTS';
    errorMessage = err.message;
  }
  else if (err instanceof FriendRequestNotFoundError) {
    statusCode = 404;
    errorCode = 'FRIEND_REQUEST_NOT_FOUND';
    errorMessage = err.message;
  }
  //Ошибки аутентификации
  else if (err instanceof FollowersUnauthorizedError || err instanceof FriendsUnauthorizedError) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    errorMessage = err.message;
  } 
  //Ошибка авторизации
  else if (err instanceof ForbiddenError) {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    errorMessage = err.message;
  } 
  else if (err instanceof AvatarUploadConfigurationError || err instanceof MailConfigurationError) {
    statusCode = 500;
    errorCode = 'CONFIGURATION_ERROR';
    errorMessage = err.message;
  }
  else if (err instanceof PasswordError) {
    statusCode = err.code === 'USER_NOT_FOUND' ? 404 : 400;
    errorCode = err.code;
    errorMessage = err.message;
    errorField = err.field;
  }
  //Обработка базовых классов
  else if (err instanceof UserError) {
    statusCode = 400;
    errorCode = 'USER_ERROR';
    errorMessage = err.message;
  } 
  else if (err instanceof FriendError) {
    statusCode = 400;
    errorCode = 'FRIEND_ERROR';
    errorMessage = err.message;
  }

  res.status(statusCode).json({
    success: false,
    message: errorMessage,
    error: {
      code: errorCode,
      message: errorMessage,
      field: errorField,
    },
  });
};