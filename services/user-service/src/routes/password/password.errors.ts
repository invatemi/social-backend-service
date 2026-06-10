export class PasswordError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'PasswordError';
  }
}

export class PasswordUserNotFoundError extends PasswordError {
  constructor() {
    super('User not found', 'USER_NOT_FOUND');
    this.name = 'PasswordUserNotFoundError';
  }
}

export class InvalidVerificationCodeError extends PasswordError {
  constructor() {
    super('Неверный код подтверждения', 'INVALID_CODE', 'code');
    this.name = 'InvalidVerificationCodeError';
  }
}

export class VerificationCodeExpiredError extends PasswordError {
  constructor() {
    super('Срок действия кода истёк. Запросите новый код', 'CODE_EXPIRED', 'code');
    this.name = 'VerificationCodeExpiredError';
  }
}

export class PasswordValidationError extends PasswordError {
  constructor(message: string, field: string) {
    super(message, 'VALIDATION_ERROR', field);
    this.name = 'PasswordValidationError';
  }
}
