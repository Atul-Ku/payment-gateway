import { Request, Response, NextFunction } from 'express'
import { createLogger, AuthenticationError } from '@payment-gateway/common'
import { createHash } from 'crypto'
import { redisClient } from '../lib/redis'
import { config } from '../config'

const logger = createLogger('api-gateway:auth')

// Extend Request type with merchant context set by this middleware.
// Downstream services receive this in forwarded headers.
declare global {
  namespace Express {
    interface Request {
      merchantId: string
      apiKeyPrefix: string
    }
  }
}

// Hash the raw API key using SHA-256.
// We never store or compare raw keys — only their hashes.
// This is the same approach Stripe uses.
const hashApiKey = (rawKey: string): string => {
  return createHash('sha256').update(rawKey).digest('hex')
}

// Extract the prefix from the key — e.g. 'sk_test_abc123' → 'sk_test_'
// The prefix tells us the environment (test vs live) and is safe to log
// because it doesn't expose the actual secret
const extractPrefix = (key: string): string => {
  // Key format: sk_test_XXXXXXXXXXXX or sk_live_XXXXXXXXXXXX
  const parts = key.split('_')
  // parts = ['sk', 'test', 'XXXXXXXXXXXX']
  return parts.slice(0, 2).join('_') + '_'  // → 'sk_test_'
}

const isValidKeyFormat = (key: string): boolean => {
  // Must start with sk_test_ or sk_live_ followed by at least 8 chars
  return /^sk_(test|live)_[a-zA-Z0-9]{8,}$/.test(key)
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // ── 1. Extract the API key from the Authorization header ──
    // Expected format: "Authorization: Bearer sk_test_abc123"
    const authHeader = req.headers['authorization']

    if (!authHeader) {
      throw new AuthenticationError('No API key provided. Include your key as: Authorization: Bearer sk_test_...')
    }

    // Split "Bearer sk_test_abc123" into ["Bearer", "sk_test_abc123"]
    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AuthenticationError('Invalid Authorization header format. Use: Bearer <api_key>')
    }

    const rawKey = parts[1]

    // ── 2. Validate key format before doing any DB/cache lookups ──
    if (!isValidKeyFormat(rawKey)) {
      throw new AuthenticationError('Invalid API key format')
    }

    const keyPrefix = extractPrefix(rawKey)
    const keyHash = hashApiKey(rawKey)

    // ── 3. Development bypass ──────────────────────────────────
    // Before the auth service is built, allow a hardcoded dev key.
    // This block gets deleted once auth service is live.
    if (config.isDev && rawKey === config.devTestApiKey) {
      logger.debug({ requestId: req.requestId }, 'Dev test key accepted')
      req.merchantId = 'merchant_dev_test_id'
      req.apiKeyPrefix = keyPrefix
      next()
      return
    }

    // ── 4. Check Redis cache for the key hash ──────────────────
    // Key format in Redis: apikey:{hash} → merchantId
    // TTL: 5 minutes — balances freshness vs DB load
    // When auth service is built, it populates this cache on key creation.
    const cacheKey = `apikey:${keyHash}`
    const cachedMerchantId = await redisClient.get(cacheKey)

    if (cachedMerchantId) {
      logger.debug({ requestId: req.requestId, keyPrefix }, 'API key validated from cache')
      req.merchantId = cachedMerchantId
      req.apiKeyPrefix = keyPrefix
      next()
      return
    }

    // ── 5. Cache miss — key not recognised ────────────────────
    // Once auth service is built, this is where we'd call it
    // to validate the key against the database. For now, reject.
    throw new AuthenticationError('Invalid API key')

  } catch (error) {
    next(error)  // Pass to global error handler in app.ts
  }
}