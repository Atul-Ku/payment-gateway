import type { Response } from 'express';
import { AppError } from './errors';

// Success response — mirrors Stripe's response envelope
export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode = 200,
): void => {
  res.status(statusCode).json({
    object: 'response',
    data,
  });
};

// Error response — every service uses this in its error handler
export const sendError = (res: Response, error: unknown): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        type: error.type,
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  // Unknown / unhandled error
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: {
      type: 'api_error',
      code: 'internal_server_error',
      message: 'Something went wrong on our end.',
    },
  });
};