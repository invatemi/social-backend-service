// Базовый класс для всех ошибок user-service
export class UserError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'UserError';
  }
}

// Ошибки валидации ввода (400 Bad Request)
export class ValidationError extends UserError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// Пользователь не найден (404 Not Found)
export class UserNotFoundError extends UserError {
  constructor(userId: number) {
    super(`User with id ${userId} not found`, 'USER_NOT_FOUND');
    this.name = 'UserNotFoundError';
  }
}

// Нельзя подписаться на себя (400 Bad Request)
export class SelfFollowError extends UserError {
  constructor() {
    super('Cannot follow yourself', 'SELF_FOLLOW');
    this.name = 'SelfFollowError';
  }
}

// Уже подписан (409 Conflict)
export class AlreadyFollowingError extends UserError {
  constructor() {
    super('Already following this user', 'ALREADY_FOLLOWING');
    this.name = 'AlreadyFollowingError';
  }
}

// Не подписан (404 Not Found)
export class NotFollowingError extends UserError {
  constructor() {
    super('Not following this user', 'NOT_FOLLOWING');
    this.name = 'NotFollowingError';
  }
}

// Ошибка аутентификации (401 Unauthorized)
export class UnauthorizedError extends UserError {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

// Ошибка авторизации (403 Forbidden)
export class ForbiddenError extends UserError {
  constructor(message: string = 'Access denied') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}