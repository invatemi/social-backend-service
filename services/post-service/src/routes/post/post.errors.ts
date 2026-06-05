// Базовый класс для всех ошибок постов
export class PostError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PostError';
  }
}

// Ошибки валидации ввода (400 Bad Request)
export class PostValidationError extends PostError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'PostValidationError';
  }
}

// Пост не найден (404 Not Found)
export class PostNotFoundError extends PostError {
  constructor(postId: number) {
    super(`Post with id ${postId} not found`, 'POST_NOT_FOUND');
    this.name = 'PostNotFoundError';
  }
}

// Нет прав на редактирование/удаление (403 Forbidden)
export class PostForbiddenError extends PostError {
  constructor(message: string = 'You do not have permission to perform this action') {
    super(message, 'FORBIDDEN');
    this.name = 'PostForbiddenError';
  }
}

// Ошибка аутентификации (401 Unauthorized)
export class UnauthorizedError extends PostError {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

// Пост уже опубликован (400 Bad Request)
export class PostAlreadyPublishedError extends PostError {
  constructor() {
    super('Post is already published', 'POST_ALREADY_PUBLISHED');
    this.name = 'PostAlreadyPublishedError';
  }
}

// Пост уже в черновиках (400 Bad Request)
export class PostAlreadyDraftError extends PostError {
  constructor() {
    super('Post is already a draft', 'POST_ALREADY_DRAFT');
    this.name = 'PostAlreadyDraftError';
  }
}