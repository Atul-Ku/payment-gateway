// ── Payment ───────────────────────────────────────────────

export type PaymentStatus =
  | 'created'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export type Currency = 'INR' | 'USD'; // add more later

export interface PaymentIntent {
  id: string;               // pi_xxxxxxxxxxxxxxxx
  merchantId: string;
  amount: number;           // always in smallest unit (paisa for INR)
  currency: Currency;
  status: PaymentStatus;
  description?: string;
  metadata?: Record<string, string>;
  clientSecret: string;     // used by the frontend HPP to confirm payment
  createdAt: Date;
  updatedAt: Date;
}

// ── Card ─────────────────────────────────────────────────

export type CardBrand = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'unknown';

export interface CardToken {
  token: string;       // tok_xxxxxxxxxxxxxxxx
  last4: string;
  brand: CardBrand;
  expMonth: number;
  expYear: number;
}

// ── Merchant ──────────────────────────────────────────────

export interface Merchant {
  id: string;
  email: string;
  businessName: string;
  webhookUrl?: string;
  createdAt: Date;
}

// ── Kafka events ──────────────────────────────────────────

export interface KafkaEvent<T = unknown> {
  eventId: string;
  eventType: string;
  timestamp: string;
  payload: T;
}

export interface PaymentSucceededEvent {
  paymentIntentId: string;
  merchantId: string;
  amount: number;
  currency: Currency;
}

export interface PaymentFailedEvent {
  paymentIntentId: string;
  merchantId: string;
  reason: string;
}