import express, { Request, Response, NextFunction } from 'express'
import { createLogger, AppError } from '@payment-gateway/common'
import { requestIdMiddleware } from './middleware/requestId.middleware'
import { requestLoggerMiddleware } from './middleware/requestLogger.middleware'
import { authMiddleware } from './middleware/auth.middleware'
import { rateLimiterMiddleware } from './middleware/rateLimiter.middleware'
import { idempotencyMiddleware } from './middleware/idempotency.middleware'
import { router } from './routes'

const logger = createLogger('api-gateway')

export const createApp = () => {
  const app = express()

  // ── Global middleware ─────────────────────────────────────────
  // These run on EVERY request, in this exact order:

  // 1. Parse JSON bodies — must be first so req.body is available
  app.use(express.json({ limit: '10mb' }))

  // 2. Assign request ID — must be very early so all subsequent
  //    middleware and logs can reference it
  app.use(requestIdMiddleware)

  // 3. Log the request — after requestId so the log includes it
  app.use(requestLoggerMiddleware)

  // ── Health check ──────────────────────────────────────────────
  // No auth required — used by Docker, Kubernetes, and load balancers
  // to check if the service is alive
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
    })
  })

  // ── Public routes (no API key required) ───────────────────────
  // /auth/register and /auth/login must be accessible without a key
  // We mount these BEFORE the auth middleware
  app.use('/auth', router)

  // ── Protected routes ──────────────────────────────────────────
  // Everything below requires a valid API key

  // 4. Validate API key — attaches req.merchantId to the request
  app.use(authMiddleware)

  // 5. Rate limit — uses req.merchantId set by authMiddleware
  app.use(rateLimiterMiddleware)

  // 6. Handle idempotency keys
  app.use(idempotencyMiddleware)

  // 7. Route to downstream services
  app.use(router)

  // ── 404 handler ───────────────────────────────────────────────
  // If no route matched, return a clean 404 instead of Express's
  // default HTML "Cannot GET /xyz" response
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        type: 'invalid_request_error',
        code: 'route_not_found',
        message: `Route ${req.method} ${req.url} not found`,
      },
    })
  })

  // ── Global error handler ──────────────────────────────────────
  // Express recognises error handlers by their 4 parameters (err, req, res, next).
  // Any middleware that calls next(error) ends up here.
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AppError) {
      // Known operational error — send clean JSON response
      logger.warn({
        requestId: req.requestId,
        code: err.code,
        statusCode: err.statusCode,
      }, err.message)

      res.status(err.statusCode).json({
        error: {
          type: err.type,
          code: err.code,
          message: err.message,
        },
      })
      return
    }

    // Unknown error — something crashed unexpectedly
    // Log the full error internally but never expose details to client
    logger.error({
      requestId: req.requestId,
      err,
    }, 'Unhandled error')

    res.status(500).json({
      error: {
        type: 'api_error',
        code: 'internal_server_error',
        message: 'Something went wrong on our end.',
      },
    })
  })

  return app
}