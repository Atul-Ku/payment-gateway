import { Router } from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { createLogger } from '@payment-gateway/common'
import { config } from '../config'

const logger = createLogger('api-gateway:proxy')

const router = Router()

// ── Helper: builds a proxy for a downstream service ────────────
// pathRewrite removes the service prefix from the URL before forwarding.
// e.g. /auth/login → /login (auth service doesn't know it's behind a gateway)
const createServiceProxy = (target: string, pathPrefix: string) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,  // Rewrites the Host header to match the target

    pathRewrite: {
      // Replace the prefix with nothing — strips /auth, /payments etc.
      [`^${pathPrefix}`]: '',
    },

    on: {
      // Forward our custom headers to the downstream service
      // so it knows who made the request
      proxyReq: (proxyReq, req: any) => {
        proxyReq.setHeader('x-request-id', req.requestId ?? '')
        proxyReq.setHeader('x-merchant-id', req.merchantId ?? '')
        proxyReq.setHeader('x-api-key-prefix', req.apiKeyPrefix ?? '')
      },

      error: (err, req: any, res: any) => {
        logger.error({
          requestId: req.requestId,
          target,
          err,
        }, 'Proxy error — downstream service unavailable')

        // If response hasn't been sent yet, send a 503
        if (!res.headersSent) {
          res.status(503).json({
            error: {
              type: 'api_error',
              code: 'service_unavailable',
              message: 'Service temporarily unavailable. Please try again.',
            },
          })
        }
      },
    },
  })
}

// ── Route definitions ───────────────────────────────────────────
// Each prefix maps to a downstream service.
// The gateway doesn't know what endpoints each service has —
// it just forwards everything with that prefix.

// Auth routes — no API key required (login, register)
// These are mounted BEFORE the auth middleware in app.ts
router.use('/auth',         createServiceProxy(config.services.auth,         '/auth'))

// Payment routes
router.use('/payments',     createServiceProxy(config.services.payment,      '/payments'))

// Card vault — HPP posts directly here
router.use('/vault',        createServiceProxy(config.services.cardVault,    '/vault'))

// Transaction & ledger
router.use('/transactions', createServiceProxy(config.services.transaction,  '/transactions'))

// Notifications & webhooks
router.use('/webhooks',     createServiceProxy(config.services.notification, '/webhooks'))

// Fraud checks (internal — normally not called by merchants directly)
router.use('/fraud',        createServiceProxy(config.services.fraud,        '/fraud'))

// Settlement
router.use('/settlements',  createServiceProxy(config.services.settlement,   '/settlements'))

// Merchant management
router.use('/merchants',    createServiceProxy(config.services.merchant,     '/merchants'))

export { router }