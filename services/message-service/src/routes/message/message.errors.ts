export class MessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageError';
  }
}

export class MessageValidationError extends MessageError {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'MessageValidationError';
    this.field = field;
  }
}

export class ChatNotFoundError extends MessageError {
  constructor(message = 'Chat not found') {
    super(message);
    this.name = 'ChatNotFoundError';
  }
}

export class MessageForbiddenError extends MessageError {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'MessageForbiddenError';
  }
}

export class UnauthorizedError extends MessageError {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
