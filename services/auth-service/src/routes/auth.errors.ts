// Базовый класс для всех ошибок аутентификации
export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// Ошибки валидации ввода (400 Bad Request)
export class ValidationError extends AuthError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// Пользователь уже существует (409 Conflict)
export class UserAlreadyExistsError extends AuthError {
  constructor(email: string) {
    super(`User with email "${email}" already exists`, 'USER_EXISTS');
    this.name = 'UserAlreadyExistsError';
  }
}

// Неверные учётные данные (401 Unauthorized)
export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS');
    this.name = 'InvalidCredentialsError';
  }
}

// Refresh token невалиден или истёк (401 Unauthorized)
export class InvalidRefreshTokenError extends AuthError {
  constructor(message: string = 'Invalid or expired refresh token') {
    super(message, 'INVALID_REFRESH_TOKEN');
    this.name = 'InvalidRefreshTokenError';
  }
}

// Ошибка авторизации (403 Forbidden)
export class ForbiddenError extends AuthError {
  constructor(message: string = 'Access denied') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}