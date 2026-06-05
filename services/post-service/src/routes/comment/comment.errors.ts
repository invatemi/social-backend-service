// Базовый класс для всех ошибок комментариев
export class CommentError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CommentError';
  }
}

// Ошибки валидации ввода (400 Bad Request)
export class ValidationError extends CommentError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// Комментарий не найден (404 Not Found)
export class CommentNotFoundError extends CommentError {
  constructor(commentId: number) {
    super(`Comment with id ${commentId} not found`, 'COMMENT_NOT_FOUND');
    this.name = 'CommentNotFoundError';
  }
}

// Пост не найден (404 Not Found)
export class PostNotFoundError extends CommentError {
  constructor(postId: number) {
    super(`Post with id ${postId} not found`, 'POST_NOT_FOUND');
    this.name = 'PostNotFoundError';
  }
}

// Нет прав на редактирование/удаление (403 Forbidden)
export class ForbiddenError extends CommentError {
  constructor(message: string = 'You do not have permission to perform this action') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

// Ошибка аутентификации (401 Unauthorized)
export class UnauthorizedError extends CommentError {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

// Комментарий уже удалён (410 Gone)
export class CommentDeletedError extends CommentError {
  constructor() {
    super('This comment has been deleted', 'COMMENT_DELETED');
    this.name = 'CommentDeletedError';
  }
}