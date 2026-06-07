// Базовый класс для всех ошибок friends-модуля
export class FriendError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'FriendError';
  }
}

// Ошибки валидации ввода (400 Bad Request)
export class ValidationError extends FriendError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// Пользователь не найден (404 Not Found)
export class UserNotFoundError extends FriendError {
  constructor(userId: number) {
    super(`User with id ${userId} not found`, 'USER_NOT_FOUND');
    this.name = 'UserNotFoundError';
  }
}

// Нельзя добавить себя в друзья (400 Bad Request)
export class SelfFriendError extends FriendError {
  constructor() {
    super('Cannot add yourself as a friend', 'SELF_FRIEND');
    this.name = 'SelfFriendError';
  }
}

// Не являются друзьями (404 Not Found)
export class NotFriendsError extends FriendError {
  constructor() {
    super('Users are not friends', 'NOT_FRIENDS');
    this.name = 'NotFriendsError';
  }
}

// Уже в друзьях (409 Conflict)
export class AlreadyFriendsError extends FriendError {
  constructor() {
    super('Users are already friends', 'ALREADY_FRIENDS');
    this.name = 'AlreadyFriendsError';
  }
}

// Заявка в друзья уже ожидает решения (409 Conflict)
export class FriendRequestAlreadyExistsError extends FriendError {
  constructor() {
    super('Friend request already exists', 'FRIEND_REQUEST_ALREADY_EXISTS');
    this.name = 'FriendRequestAlreadyExistsError';
  }
}

// Заявка в друзья не найдена (404 Not Found)
export class FriendRequestNotFoundError extends FriendError {
  constructor() {
    super('Friend request not found', 'FRIEND_REQUEST_NOT_FOUND');
    this.name = 'FriendRequestNotFoundError';
  }
}

// Ошибка аутентификации (401 Unauthorized)
export class UnauthorizedError extends FriendError {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}