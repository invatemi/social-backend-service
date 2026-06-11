/** Базовая ошибка домена аутентификации. */
export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Ошибка валидации входных данных. */
export class ValidationError extends AuthError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/** Пользователь с таким email уже существует. */
export class UserAlreadyExistsError extends AuthError {
  constructor(email: string) {
    super(`User with email "${email}" already exists`, 'USER_EXISTS');
    this.name = 'UserAlreadyExistsError';
  }
}

/** Неверный email или пароль. */
export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS');
    this.name = 'InvalidCredentialsError';
  }
}

/** Refresh token недействителен или истёк. */
export class InvalidRefreshTokenError extends AuthError {
  constructor(message: string = 'Invalid or expired refresh token') {
    super(message, 'INVALID_REFRESH_TOKEN');
    this.name = 'InvalidRefreshTokenError';
  }
}

/** Доступ запрещён. */
export class ForbiddenError extends AuthError {
  constructor(message: string = 'Access denied') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}
