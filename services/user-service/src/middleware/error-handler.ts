import { Request, Response, NextFunction } from 'express';

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
  UnauthorizedError as FriendsUnauthorizedError,
} from '../routes/friends/friends.errors';

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

  //Ошибки валидации
  if (err instanceof FollowersValidationError || err instanceof FriendsValidationError) {
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
    errorField = err.field;
  } 
  //Пользователь не найден
  else if (err instanceof FollowersUserNotFoundError || err instanceof FriendsUserNotFoundError) {
    errorCode = 'USER_NOT_FOUND';
    errorMessage = err.message;
  } 
  //Специфичные ошибки модуля followers
  else if (err instanceof SelfFollowError) {
    errorCode = 'SELF_FOLLOW';
    errorMessage = err.message;
  } 
  else if (err instanceof AlreadyFollowingError) {
    errorCode = 'ALREADY_FOLLOWING';
    errorMessage = err.message;
  } 
  else if (err instanceof NotFollowingError) {
    errorCode = 'NOT_FOLLOWING';
    errorMessage = err.message;
  } 
  //Специфичные ошибки модуля friends
  else if (err instanceof SelfFriendError) {
    errorCode = 'SELF_FRIEND';
    errorMessage = err.message;
  } 
  else if (err instanceof NotFriendsError) {
    errorCode = 'NOT_FRIENDS';
    errorMessage = err.message;
  } 
  else if (err instanceof AlreadyFriendsError) {
    errorCode = 'ALREADY_FRIENDS';
    errorMessage = err.message;
  } 
  //Ошибки аутентификации
  else if (err instanceof FollowersUnauthorizedError || err instanceof FriendsUnauthorizedError) {
    errorCode = 'UNAUTHORIZED';
    errorMessage = err.message;
  } 
  //Ошибка авторизации
  else if (err instanceof ForbiddenError) {
    errorCode = 'FORBIDDEN';
    errorMessage = err.message;
  } 
  //Обработка базовых классов
  else if (err instanceof UserError) {
    errorCode = 'USER_ERROR';
    errorMessage = err.message;
  } 
  else if (err instanceof FriendError) {
    errorCode = 'FRIEND_ERROR';
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