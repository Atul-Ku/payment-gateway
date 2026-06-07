import { Request, Response, NextFunction } from 'express'
import { createLogger } from '@payment-gateway/common'

const logger = createLogger('api-gateway')

export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the incoming request immediately
  logger.info({
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }, 'Incoming request')

  // res.on('finish') fires after the response is fully sent.
  // We hook into it here to log the outcome without blocking
  // the request — the logging happens asynchronously after
  // the client already got their response.
  res.on('finish', () => {
    const duration = Date.now() - req.startTime
    const level = res.statusCode >= 500
      ? 'error'
      : res.statusCode >= 400
        ? 'warn'
        : 'info'

    logger[level]({
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: duration,
    }, 'Request completed')
  })

  next()
}