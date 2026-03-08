import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

const PI_BASE_URL = 'https://api.minepi.com/v2';
const IS_MAINNET = process.env.PI_NETWORK === 'mainnet';
const NETWORK = IS_MAINNET ? 'Pi Network' : 'Pi Testnet';

const PI_ERROR_MESSAGES: Record<string, string> = {
  payment_not_found: 'Payment not found on the Pi Network.',
  payment_already_completed: 'This payment has already been completed.',
  unauthorized: 'API key is invalid or unauthorized.',
  network_error: 'Network error, please try again.',
};

const rateLimitMap = new Map<string, { count: number; startTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

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

const completedPayments = new Map<string, string>();

const API_KEY = IS_MAINNET
  ? process.env.PI_API_KEY_MAINNET
  : process.env.PI_API_KEY_TESTNET;

if (!API_KEY) {
  console.error(`[complete-payment] Missing ${IS_MAINNET ? 'PI_API_KEY_MAINNET' : 'PI_API_KEY_TESTNET'}`);
}

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

function logTransaction(data: {
  paymentId: string;
  txid?: string;
  status: string;
  error?: string;
}): void {
  console.log('[Transaction Log]', {
    ...data,
    network: NETWORK,
    timestamp: new Date().toISOString(),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured for this network.' });
  }

  const { paymentId, txid } = req.body ?? {};

  if (!paymentId || typeof paymentId !== 'string' || paymentId.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid paymentId.' });
  }

  if (!txid || typeof txid !== 'string' || txid.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid txid.' });
  }

  const sanitizedPaymentId = paymentId.trim();
  const sanitizedTxid = txid.trim();

  if (isRateLimited(sanitizedPaymentId)) {
    console.warn(`[complete-payment] Rate limit exceeded for paymentId: ${sanitizedPaymentId}`);
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const existingTxid = completedPayments.get(sanitizedPaymentId);
  if (existingTxid) {
    console.warn(`[complete-payment] Double-complete attempt for paymentId: ${sanitizedPaymentId}`);
    return res.status(409).json({ error: 'Payment already completed.', txid: existingTxid });
  }

  try {
    console.log(`[complete-payment] Completing paymentId: ${sanitizedPaymentId} | TXID: ${sanitizedTxid}`);

    // ✅ FIX: removed unused 'response' variable
    await axios.post(
      `${PI_BASE_URL}/payments/${sanitizedPaymentId}/complete`,
      { txid: sanitizedTxid },
      { headers: { Authorization: `Key ${API_KEY}` } }
    );

    completedPayments.set(sanitizedPaymentId, sanitizedTxid);
    logTransaction({ paymentId: sanitizedPaymentId, txid: sanitizedTxid, status: 'completed' });

    return res.status(200).json({
      success: true,
      txid: sanitizedTxid,
      message: 'Payment completed successfully.',
    });

  } catch (error: any) {
    const statusCode = error.response?.status ?? 500;
    const friendlyMessage = resolveErrorMessage(error);

    console.error('[complete-payment] Error:', error.response?.data || error.message);
    logTransaction({ paymentId: sanitizedPaymentId, txid: sanitizedTxid, status: 'failed', error: error.message });

    return res.status(statusCode).json({
      error: 'Failed to complete payment.',
      message: friendlyMessage,
      ...(process.env.NODE_ENV === 'development' && { debug: error.response?.data || error.message }),
    });
  }
}
