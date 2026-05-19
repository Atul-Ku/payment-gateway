import pino from 'pino';

export const createLogger = (serviceName: string) => {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL ?? 'info',
    // Pretty-print in dev, raw JSON in production
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
};

export type Logger = ReturnType<typeof createLogger>;