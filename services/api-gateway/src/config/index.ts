import dotenv from "dotenv";
import path from "path";

// Load env file from project root — two levels up from services/api-gateway/
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.prod"
    : process.env.NODE_ENV === "test"
      ? ".env.test"
      : ".env.dev";

dotenv.config({ path: path.resolve(__dirname, `../../../${envFile}`) });

// Helper that throws at startup if a required env var is missing.
// Much better than getting a cryptic error at runtime when the var is used.
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

// Helper for optional vars with a fallback default
const optional = (key: string, defaultValue: string): string => {
  return process.env[key] ?? defaultValue;
};

export const config = {
  // ── Service ────────────────────────────────────────────────
  port: parseInt(optional("API_GATEWAY_PORT", "3000"), 10),
  nodeEnv: optional("NODE_ENV", "development"),
  isDev: optional("NODE_ENV", "development") === "development",

  // ── Redis ──────────────────────────────────────────────────
  redis: {
    host: optional("REDIS_HOST", "localhost"),
    port: parseInt(optional("REDIS_PORT", "6379"), 10),
  },

  // ── Rate limiting ──────────────────────────────────────────
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute window in milliseconds
    maxRequests: 100, // max requests per window per API key
  },

  // ── Downstream service URLs ────────────────────────────────
  // These are where the gateway proxies requests to.
  // In dev, services run on localhost. In prod, they'd be
  // Kubernetes service DNS names like http://auth-service:3001
  services: {
    auth: optional("AUTH_SERVICE_URL", "http://localhost:3001"),
    payment: optional("PAYMENT_SERVICE_URL", "http://localhost:3002"),
    cardVault: optional("CARD_VAULT_URL", "http://localhost:3003"),
    transaction: optional("TRANSACTION_SERVICE_URL", "http://localhost:3004"),
    notification: optional("NOTIFICATION_SERVICE_URL", "http://localhost:3005"),
    fraud: optional("FRAUD_SERVICE_URL", "http://localhost:3006"),
    settlement: optional("SETTLEMENT_SERVICE_URL", "http://localhost:3007"),
    merchant: optional("MERCHANT_SERVICE_URL", "http://localhost:3008"),
  },

  // ── Dev test key ───────────────────────────────────────────
  // A hardcoded key for development only — lets you test the
  // gateway before the auth service and merchant DB are built.
  // This gets removed once auth service is live.
  devTestApiKey: optional("DEV_TEST_API_KEY", "sk_test_dev_only_key_12345"),
};
