import { createApp } from './app'
import { createLogger } from '@payment-gateway/common'
import { redisClient } from './lib/redis'
import { config } from './config'

const logger = createLogger('api-gateway')

const start = async () => {
  try {
    // Connect to Redis before starting the server
    // If Redis is unavailable, crash early with a clear error
    await redisClient.connect()
    logger.info('Redis connection established')

    const app = createApp()

    const server = app.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.nodeEnv,
      }, `API Gateway running on port ${config.port}`)
    })

    // ── Graceful shutdown ─────────────────────────────────────
    // When the process receives SIGTERM (e.g. from Docker or Kubernetes
    // stopping the container), finish in-flight requests before exiting.
    // Without this, active requests get killed mid-flight — bad for payments.
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received')

      server.close(async () => {
        logger.info('HTTP server closed')
        await redisClient.quit()
        logger.info('Redis connection closed')
        process.exit(0)
      })

      // Force exit after 10 seconds if graceful shutdown hangs
      setTimeout(() => {
        logger.error('Forced shutdown after timeout')
        process.exit(1)
      }, 10000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT',  () => shutdown('SIGINT'))   // Ctrl+C in terminal

  } catch (error) {
    logger.error({ error }, 'Failed to start API Gateway')
    process.exit(1)
  }
}

start();