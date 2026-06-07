import { Request, Response, NextFunction } from 'express'
import { createLogger, RateLimitError } from '@payment-gateway/common'
import { redisClient } from '../lib/redis'
import { config } from '../config'

const logger = createLogger('api-gateway:ratelimit')

// ── How sliding window rate limiting works ─────────────────────
//
// Fixed window (naive): reset counter every 60s
//   Problem: 100 requests at 0:59, 100 more at 1:01 = 200 in 2 seconds
//
// Sliding window (what we use): track exact timestamps in a sorted set
//   - Key:   ratelimit:{merchantId}
//   - Score: request timestamp (Unix ms)
//   - Value: unique request ID (to handle same-millisecond requests)
//
//   On each request:
//   1. Remove all entries older than (now - windowMs)
//   2. Count remaining entries
//   3. If count >= limit → reject with 429
//   4. Otherwise → add current timestamp, set TTL, allow
//
//   This gives an accurate rolling window — no edge case spikes

export const rateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { windowMs, maxRequests } = config.rateLimit
    const now = Date.now()
    const windowStart = now - windowMs

    // Use merchantId as the rate limit key — each merchant
    // gets their own independent 100 req/min allowance
    const key = `ratelimit:${req.merchantId}`

    // ── Execute all Redis commands atomically with a pipeline ──
    // A pipeline sends all commands in one network round trip
    // instead of 4 separate ones — much faster
    const pipeline = redisClient.pipeline()

    // Step 1: Remove timestamps older than the window
    // ZREMRANGEBYSCORE removes all members with score between -inf and windowStart
    pipeline.zremrangebyscore(key, '-inf', windowStart)

    // Step 2: Count how many requests are in the current window
    pipeline.zcard(key)

    // Step 3: Add current request with timestamp as score
    // Using `${now}-${Math.random()}` as the member value because
    // sorted sets require unique members — two requests in the same
    // millisecond would overwrite each other without the random suffix
    pipeline.zadd(key, now, `${now}-${Math.random()}`)

    // Step 4: Reset the TTL so the key expires naturally
    // after one idle window — prevents Redis memory leaks
    pipeline.expire(key, Math.ceil(windowMs / 1000))

    const results = await pipeline.exec()

    // results[1] is the zcard result — [error, count]
    // The '!' tells TypeScript we know this isn't null
    const requestCount = results![1][1] as number

    // Set rate limit headers so clients know their current status
    // (Same headers GitHub, Stripe use)
    res.setHeader('X-RateLimit-Limit', maxRequests)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - requestCount - 1))
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000))

    if (requestCount >= maxRequests) {
      logger.warn({
        requestId: req.requestId,
        merchantId: req.merchantId,
        requestCount,
        limit: maxRequests,
      }, 'Rate limit exceeded')

      throw new RateLimitError()
    }

    next()
  } catch (error) {
    next(error)
  }
}