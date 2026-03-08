import { useState } from 'react';
import axios from 'axios';

// ============================================================
// TYPES
// ============================================================
interface PiUser {
  uid: string;
  username: string;
  roles?: string[];
}

interface PiPayment {
  identifier: string;
  transaction?: {
    txid?: string;
  } | null;
}

// ============================================================
// HELPERS
// ============================================================

// Retry helper — retries an async function up to `retries` times
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLast = attempt === retries;
      console.warn(`[Pi] Attempt ${attempt} failed:`, error.message);
      if (isLast) throw error;
      await new Promise((res) => setTimeout(res, delayMs * attempt));
    }
  }
  throw new Error('All retry attempts failed.');
}

// ============================================================
// HOOK
// ============================================================
export const usePiNetwork = () => {
  const [user, setUser] = useState<PiUser | null>(null);

  // ---- Handle incomplete payments found during authenticate ----
  const onIncompletePaymentFound = async (payment: PiPayment) => {
    console.warn('[Pi] Incomplete payment found:', payment.identifier);

    const txid = payment.transaction?.txid;

    // If no txid yet, the payment was never submitted — nothing to complete
    if (!txid) {
      console.warn('[Pi] No txid found for incomplete payment — skipping complete step.');
      return;
    }

    try {
      await withRetry(() =>
        axios.post('/api/complete-payment', {
          paymentId: payment.identifier,
          txid,
        })
      );
      console.log('[Pi] Incomplete payment resolved successfully.');
    } catch (error: any) {
      console.error('[Pi] Failed to resolve incomplete payment:', error.message);
    }
  };

  // ---- Authenticate ----
  const authenticate = async (): Promise<PiUser> => {
    try {
      const scopes = ['payments', 'username'];

      // true = Testnet | false = Mainnet (change when going to production)
      window.Pi.init({ version: '2.0', sandbox: true });

      const authResult = await window.Pi.authenticate(scopes, onIncompletePaymentFound);

      if (!authResult?.user?.uid) {
        throw new Error('No user data received from Pi authentication.');
      }

      setUser(authResult.user);
      console.log('[Pi] Authenticated:', authResult.user.username);
      return authResult.user;
    } catch (error: any) {
      console.error('[Pi] Authentication failed:', error.message);
      throw error;
    }
  };

  // ---- U2A Payment (User-to-App) ----
  const createPayment = async (amount: number, memo: string): Promise<void> => {
    const paymentData = {
      amount,
      memo,
      metadata: { productId: 'test-product-1' },
    };

    const paymentCallbacks = {
      // Step 1: Pi SDK calls this when payment is ready for server approval
      onReadyForServerApproval: async (paymentId: string) => {
        console.log('[Pi] Ready for server approval. PaymentID:', paymentId);
        try {
          await withRetry(() =>
            axios.post('/api/approve-payment', { paymentId })
          );
          console.log('[Pi] Payment approved successfully.');
        } catch (error: any) {
          console.error('[Pi] Approval failed:', error.message);
        }
      },

      // Step 2: Pi SDK calls this after blockchain submission
      onReadyForServerCompletion: async (paymentId: string, txid: string) => {
        console.log('[Pi] Ready for server completion. TXID:', txid);
        try {
          await withRetry(() =>
            axios.post('/api/complete-payment', { paymentId, txid })
          );
          console.log('[Pi] Payment completed successfully.');
        } catch (error: any) {
          console.error('[Pi] Completion failed:', error.message);
        }
      },

      onCancel: (paymentId: string) => {
        console.warn('[Pi] Payment cancelled by user. PaymentID:', paymentId);
      },

      onError: (error: any, payment: any) => {
        console.error('[Pi] Payment error:', error?.message || error, payment);
      },
    };

    try {
      await window.Pi.createPayment(paymentData, paymentCallbacks);
    } catch (error: any) {
      console.error('[Pi] createPayment failed:', error.message);
      throw error;
    }
  };

  return { user, authenticate, createPayment };
};
