import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// ============================================================
// CONFIG
// ============================================================
const PI_BASE_URL = 'https://api.minepi.com/v2';
const IS_MAINNET = process.env.PI_NETWORK === 'mainnet';
const NETWORK = IS_MAINNET ? 'pi_mainnet' : 'pi_testnet';

// ============================================================
// KNOWN PI ERROR MESSAGES
// ============================================================
const PI_ERROR_MESSAGES: Record<string, string> = {
  payment_not_found: 'Payment not found on the Pi Network.',
  payment_already_approved: 'This payment has already been approved.',
  unauthorized: 'API key is invalid or unauthorized.',
  network_error: 'Network error, please try again.',
};

// ============================================================
// RATE LIMITER - In-memory (replace with Upstash in Production)
// ============================================================
const rateLimitMap = new Map<string, { count: number; startTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5;       // 5 requests per paymentId

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, startTime: now });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) return true;

  record.count += 1;
  return false;
}

// ============================================================
// IN-MEMORY DOUBLE-APPROVE GUARD
// Note: resets on cold start. Pi Network API also enforces
// the created → approved state machine on its side.
// Replace with a DB check in Production for full protection.
// ============================================================
const paymentStore = new Map<string, { status: string }>();

// ============================================================
// HELPER - Resolve a friendly error message
// ============================================================
function resolveErrorMessage(error: any): string {
  const piError = error.response?.data?.error_code || error.response?.data?.message || '';
  const errorKey = Object.keys(PI_ERROR_MESSAGES).find(
    (key) =>
      piError?.toLowerCase().includes(key.toLowerCase()) ||
      error?.message?.toLowerCase().includes(key.toLowerCase())
  );
  return errorKey
    ? PI_ERROR_MESSAGES[errorKey]
    : error.response?.data?.message || error.message || 'An unexpected error occurred.';
}

// ============================================================
// HELPER - Log transaction (replace with DB call in Production)
// ============================================================
function logTransaction(data: {
  paymentId: string;
  status: string;
  error?: string;
}): void {
  // Example: await db.transactions.upsert({ paymentId: data.paymentId, ...data });
  console.log('[Transaction Log]', {
    ...data,
    network: NETWORK,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// VALIDATE API KEY ON STARTUP
// ============================================================
const API_KEY = IS_MAINNET ? process.env.PI_API_KEY_MAINNET : process.env.PI_API_KEY_TESTNET;

if (!API_KEY) {
  console.error(
    `[approve-payment] Missing ${IS_MAINNET ? 'PI_API_KEY_MAINNET' : 'PI_API_KEY_TESTNET'} in .env`
  );
}

// ============================================================
// MAIN HANDLER
// ============================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Method check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. API key guard
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured for this network.' });
  }

  // 3. Validate body
  const { paymentId } = req.body ?? {};

  if (!paymentId || typeof paymentId !== 'string' || paymentId.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid paymentId.' });
  }

  const sanitizedPaymentId = paymentId.trim();

  // 4. Rate limiting
  if (isRateLimited(sanitizedPaymentId)) {
    console.warn(`[approve-payment] Rate limit exceeded for paymentId: ${sanitizedPaymentId}`);
    return res.status(429).json({
      error: 'Too many requests. Please wait a minute and try again.',
    });
  }

  // 5. Double-approve guard (in-memory)
  const existing = paymentStore.get(sanitizedPaymentId);
  if (existing?.status === 'approved') {
    console.warn(`[approve-payment] Double-approve attempt for paymentId: ${sanitizedPaymentId}`);
    return res.status(409).json({
      error: 'Payment already approved (double-approve prevention).',
    });
  }

  // Mark as pending before calling Pi API
  paymentStore.set(sanitizedPaymentId, { status: 'pending' });

  try {
    console.log(`[approve-payment] Approving paymentId: ${sanitizedPaymentId}`);

    // 6. Send approval request to Pi Network
    await axios.post(
      `${PI_BASE_URL}/payments/${sanitizedPaymentId}/approve`,
      {},
      { headers: { Authorization: `Key ${API_KEY}` } }
    );

    // 7. Update store & log
    paymentStore.set(sanitizedPaymentId, { status: 'approved' });
    logTransaction({ paymentId: sanitizedPaymentId, status: 'approved' });

    return res.status(200).json({
      success: true,
      message: 'Payment approved successfully.',
    });

  } catch (error: any) {
    const statusCode = error.response?.status ?? 500;
    const friendlyMessage = resolveErrorMessage(error);

    console.error('[approve-payment] Error:', error.response?.data || error.message);

    // Reset store so it can be retried
    paymentStore.delete(sanitizedPaymentId);
    logTransaction({
      paymentId: sanitizedPaymentId,
      status: 'failed',
      error: error.message,
    });

    return res.status(statusCode).json({
      error: 'Failed to approve payment.',
      message: friendlyMessage,
      ...(process.env.NODE_ENV === 'development' && { debug: error.response?.data || error.message }),
    });
  }
}
