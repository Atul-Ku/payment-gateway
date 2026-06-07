import { Request, Response, NextFunction } from 'express'
import { createLogger } from '@payment-gateway/common'
import { redisClient } from '../lib/redis'

const logger = createLogger('api-gateway:idempotency')

// Idempotency ensures that retrying a failed request doesn't
// create duplicate payments. If a merchant sends the same
// Idempotency-Key twice, they get the same response back.
//
// Only applies to state-changing methods (POST, PUT, PATCH, DELETE).
// GET requests are naturally idempotent (reading data never changes it).

export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Skip idempotency check for read-only methods
  const stateMutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE']
  if (!stateMutatingMethods.includes(req.method)) {
    next()
    return
  }

  const idempotencyKey = req.headers['idempotency-key'] as string | undefined

  // Idempotency key is optional — not all requests need it.
  // Payment creation should always send one, but other endpoints may not.
  if (!idempotencyKey) {
    next()
    return
  }

  // Validate key length — prevent absurdly long keys
  if (idempotencyKey.length > 255) {
    res.status(400).json({
      error: {
        type: 'invalid_request_error',
        code: 'idempotency_key_too_long',
        message: 'Idempotency-Key must be 255 characters or fewer',
      },
    })
    return
  }

  // Attach to request so the payment service can use it
  // when creating the payment intent in the database
  req.headers['x-idempotency-key'] = idempotencyKey

  // Check if we've seen this key before for this merchant
  const cacheKey = `idempotency:${req.merchantId}:${idempotencyKey}`
  const cachedResponse = await redisClient.get(cacheKey)

  if (cachedResponse) {
    // We've seen this exact request before — replay the cached response
    logger.info({
      requestId: req.requestId,
      idempotencyKey,
      merchantId: req.merchantId,
    }, 'Replaying idempotent response')

    const parsed = JSON.parse(cachedResponse)
    res.status(parsed.statusCode).json(parsed.body)
    return
  }

  // First time seeing this key — let the request through.
  // The payment service will store the response in Redis
  // after successfully processing, using the same cacheKey.
  // TTL: 24 hours (standard across the industry)
  req.headers['x-idempotency-cache-key'] = cacheKey

  next()
}