import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'

// Extend Express's Request type to include our custom fields.
// This tells TypeScript that req.requestId exists — without this,
// TypeScript would error when you try to access req.requestId anywhere.
declare global {
  namespace Express {
    interface Request {
      requestId: string
      startTime: number
    }
  }
}

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if the client already sent a request ID (useful for
  // end-to-end tracing across multiple systems). If not, generate one.
  const existingId = req.headers['x-request-id'] as string | undefined
  const requestId = existingId ?? uuidv4()

  // Attach to the request object so every subsequent middleware
  // and route handler can access it via req.requestId
  req.requestId = requestId

  // Record when the request arrived — used later to calculate
  // response time in the logger
  req.startTime = Date.now()

  // Send the ID back in the response headers so the client
  // can use it when reporting issues ("my request ID was abc-123")
  res.setHeader('x-request-id', requestId)

  next()
}