import Redis from 'ioredis'
import { createLogger } from '@payment-gateway/common'
import { config } from '../config'

const logger = createLogger('api-gateway:redis')

// Single Redis client instance — shared across all middleware.
// ioredis automatically handles reconnection if Redis goes down.
export const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,

  // If a command fails because Redis is connecting/reconnecting,
  // ioredis queues it and retries automatically
  enableOfflineQueue: true,

  // Retry connection with increasing delay up to 3 seconds
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis connection failed after 10 retries')
      return null  // Stop retrying
    }
    return Math.min(times * 100, 3000) // 100ms, 200ms... up to 3s
  },

  lazyConnect: true, // Don't connect until first command — cleaner startup
})

redisClient.on('connect', () => {
  logger.info('Redis connected')
})

redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis connection error')
})

redisClient.on('reconnecting', () => {
  logger.warn('Redis reconnecting...')
})