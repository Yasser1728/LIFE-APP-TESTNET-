/**
 * Simulated payment database for development / demo purposes.
 *
 * In production replace this module with a real database adapter, e.g.:
 *
 *   MongoDB example schema:
 *   {
 *     paymentId : String  (unique index),
 *     status    : 'pending' | 'approved' | 'completed',
 *     network   : 'pi_testnet' | 'pi_mainnet',
 *     uid       : String,   // Pi user UID (App-to-User payments)
 *     txid      : String,   // blockchain txid (set on completion)
 *     createdAt : Date,
 *     updatedAt : Date,
 *   }
 *
 * The in-memory store resets on every cold start but is sufficient for
 * preventing double-spending within a single function invocation lifetime
 * and for local development.
 */

export type PaymentStatus = 'pending' | 'approved' | 'completed';

export interface PaymentRecord {
  paymentId: string;
  status: PaymentStatus;
  network: string;
  uid?: string;
  txid?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** In-memory store — swap for a real DB client in production. */
const paymentStore = new Map<string, PaymentRecord>();

/** Returns true when a payment ID is already tracked (double-spend guard). */
export function hasPayment(paymentId: string): boolean {
  return paymentStore.has(paymentId);
}

/** Retrieves a tracked payment record. */
export function getPayment(paymentId: string): PaymentRecord | undefined {
  return paymentStore.get(paymentId);
}

/**
 * Persists a new payment.
 * Throws immediately if the paymentId is already in the store.
 */
export function savePayment(
  paymentId: string,
  network: string,
  uid?: string
): PaymentRecord {
  if (paymentStore.has(paymentId)) {
    throw new Error(
      `Payment ${paymentId} already exists — double-spend prevented`
    );
  }
  const record: PaymentRecord = {
    paymentId,
    status: 'pending',
    network,
    uid,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  paymentStore.set(paymentId, record);
  return record;
}

/**
 * Updates the status (and optionally the txid) of a tracked payment.
 * Throws if the payment is not found.
 */
export function updatePaymentStatus(
  paymentId: string,
  status: Exclude<PaymentStatus, 'pending'>,
  txid?: string
): PaymentRecord {
  const record = paymentStore.get(paymentId);
  if (!record) {
    throw new Error(`Payment ${paymentId} not found in store`);
  }
  record.status = status;
  record.updatedAt = new Date();
  if (txid) record.txid = txid;
  return record;
}
