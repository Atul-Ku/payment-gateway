// Every error has a type, a code, and an HTTP status.
// This makes our API responses consistent across all services.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly type: string;
  public readonly isOperational: boolean;

  constructor({
    message,
    statusCode,
    code,
    type,
  }: {
    message: string;
    statusCode: number;
    code: string;
    type: string;
  }) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.type = type;
    this.isOperational = true; // operational = expected error, not a bug
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'validation_error') {
    super({ message, statusCode: 400, code, type: 'invalid_request_error' });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Invalid API key') {
    super({ message, statusCode: 401, code: 'invalid_api_key', type: 'authentication_error' });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super({
      message: `${resource} not found`,
      statusCode: 404,
      code: 'resource_not_found',
      type: 'invalid_request_error',
    });
  }
}

export class PaymentError extends AppError {
  constructor(message: string, code = 'payment_failed') {
    super({ message, statusCode: 402, code, type: 'card_error' });
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super({
      message: 'Too many requests. Slow down.',
      statusCode: 429,
      code: 'rate_limit_exceeded',
      type: 'rate_limit_error',
    });
  }
}