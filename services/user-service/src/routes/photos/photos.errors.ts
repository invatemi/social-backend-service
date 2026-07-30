import { ForbiddenError, UserNotFoundError, ValidationError } from '../followers/followers.errors';

export class PhotoNotFoundError extends Error {
  readonly code = 'PHOTO_NOT_FOUND';

  constructor(photoId: number) {
    super(`Photo with id ${photoId} not found`);
    this.name = 'PhotoNotFoundError';
  }
}

export class PhotoCommentNotFoundError extends Error {
  readonly code = 'PHOTO_COMMENT_NOT_FOUND';

  constructor(commentId: number) {
    super(`Photo comment with id ${commentId} not found`);
    this.name = 'PhotoCommentNotFoundError';
  }
}

export { ForbiddenError, UserNotFoundError, ValidationError };
