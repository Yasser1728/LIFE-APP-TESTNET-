import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import * as StellarSdk from '@stellar/stellar-sdk';

// ============================================================
// CONFIG
// ============================================================
const IS_MAINNET = process.env.PI_NETWORK === 'mainnet';

const PI_API_BASE = 'https://api.minepi.com/v2';

const STELLAR_HORIZON = IS_MAINNET
  ? 'https://api.mainnet.minepi.com'
  : 'https://api.testnet.minepi.com';

// CRITICAL: must match the network exactly
const NETWORK_PASSPHRASE = IS_MAINNET ? 'Pi Network' : 'Pi Testnet';

const PAYMENT_CONFIG = {
  amount: '0.1',
  memo: IS_MAINNET ? 'A2U Mainnet Reward' : 'A2U Testnet Completion',
  metadata: { type: 'checklist_10_10' },
};

// ============================================================
// RATE LIMITER - In-memory (replace with Upstash in Production)
// ============================================================
const rateLimitMap = new Map<string, { count: number; startTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 3;      // 3 requests per UID per minute

function isRateLimited(uid: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(uid);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(uid, { count: 1, startTime: now });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) return true;

  record.count += 1;
  return false;
}

// ============================================================
// VALIDATE ENV VARS ON STARTUP
// ============================================================
const API_KEY = IS_MAINNET
  ? process.env.PI_API_KEY_MAINNET
  : process.env.PI_API_KEY_TESTNET;

const WALLET_SEED = IS_MAINNET
  ? process.env.PI_APP_WALLET_SEED_MAINNET
  : process.env.PI_APP_WALLET_SEED_TESTNET;

if (!API_KEY) {
  console.error(`[pay-test-user] Missing ${IS_MAINNET ? 'PI_API_KEY_MAINNET' : 'PI_API_KEY_TESTNET'}`);
}
if (!WALLET_SEED) {
  console.error(`[pay-test-user] Missing ${IS_MAINNET ? 'PI_APP_WALLET_SEED_MAINNET' : 'PI_APP_WALLET_SEED_TESTNET'}`);
}

// ============================================================
// HELPER - Axios client for Pi API
// ============================================================
const piAxios = axios.create({
  baseURL: PI_API_BASE,
  timeout: 20000,
  headers: {
    Authorization: `Key ${API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// ============================================================
// HELPER - Log transaction (replace with DB call in Production)
// ============================================================
function logTransaction(data: {
  uid: string;
  paymentId: string | null;
  txid: string | null;
  status: string;
  error?: string;
}): void {
  console.log('[Transaction Log]', {
    ...data,
    network: NETWORK_PASSPHRASE,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// HELPER - Resolve friendly error message
// ============================================================
function resolveErrorMessage(error: any): string {
  const piMsg = error?.response?.data?.message || error?.response?.data?.error_code;
  return piMsg || error?.message || 'An unexpected error occurred.';
}

// ============================================================
// MAIN HANDLER
// ============================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {

  // 1. Method check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. ENV guard
  if (!API_KEY || !WALLET_SEED) {
    return res.status(500).json({ error: 'Server misconfiguration: missing API key or wallet seed.' });
  }

  // 3. Validate UID
  const { uid } = req.body ?? {};
  if (!uid || typeof uid !== 'string' || uid.trim() === '') {
    return res.status(400).json({ error: 'invalid_uid', message: 'User UID is required.' });
  }
  const sanitizedUid = uid.trim();

  // 4. Rate limiting
  if (isRateLimited(sanitizedUid)) {
    console.warn(`[pay-test-user] Rate limit exceeded for UID: ${sanitizedUid}`);
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please wait a minute and try again.',
    });
  }

  let paymentId: string | null = null;
  let txid: string | null = null;

  try {
    console.log(`[pay-test-user] Starting A2U for UID: ${sanitizedUid} | Network: ${NETWORK_PASSPHRASE}`);

    // --------------------------------------------------------
    // STEP 1 - Create payment on Pi server
    // Returns: paymentId (identifier) + recipientAddress (recipient)
    // --------------------------------------------------------
    const createRes = await piAxios.post('/payments', {
      amount: parseFloat(PAYMENT_CONFIG.amount),
      memo: PAYMENT_CONFIG.memo,
      metadata: PAYMENT_CONFIG.metadata,
      uid: sanitizedUid,
    });

    paymentId = createRes.data.identifier;
    const recipientAddress: string = createRes.data.recipient;

    if (!paymentId || !recipientAddress) {
      throw new Error('Pi server did not return paymentId or recipientAddress.');
    }
    console.log(`[pay-test-user] Payment created. ID: ${paymentId} | Recipient: ${recipientAddress}`);

    // --------------------------------------------------------
    // STEP 2 - Load app wallet account from Pi blockchain
    // Always load fresh - account could have changed
    // --------------------------------------------------------
    const server = new StellarSdk.Horizon.Server(STELLAR_HORIZON, { allowHttp: false });
    const keypair = StellarSdk.Keypair.fromSecret(WALLET_SEED);
    const myPublicKey = keypair.publicKey();

    const [account, baseFee, timebounds] = await Promise.all([
      server.loadAccount(myPublicKey),
      server.fetchBaseFee(),
      server.fetchTimebounds(180),
    ]);
    console.log(`[pay-test-user] Account loaded. PublicKey: ${myPublicKey}`);

    // --------------------------------------------------------
    // STEP 3 - Build transaction
    // CRITICAL: paymentId must be the memo
    // CRITICAL: networkPassphrase must match the network
    // --------------------------------------------------------
    const paymentOperation = StellarSdk.Operation.payment({
      destination: recipientAddress,
      asset: StellarSdk.Asset.native(),
      amount: PAYMENT_CONFIG.amount,
    });

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: String(baseFee),
      networkPassphrase: NETWORK_PASSPHRASE,
      timebounds,
    })
      .addOperation(paymentOperation)
      .addMemo(StellarSdk.Memo.text(paymentId)) // REQUIRED by Pi Network
      .build();

    // --------------------------------------------------------
    // STEP 4 - Sign transaction with app wallet seed
    // --------------------------------------------------------
    transaction.sign(keypair);
    console.log(`[pay-test-user] Transaction signed.`);

    // --------------------------------------------------------
    // STEP 5 - Submit transaction to Pi blockchain
    // --------------------------------------------------------
    const submitResult = await server.submitTransaction(transaction);
    txid = submitResult.hash;

    if (!txid) throw new Error('Blockchain submission failed. No TXID received.');
    console.log(`[pay-test-user] Transaction submitted. TXID: ${txid}`);

    // --------------------------------------------------------
    // STEP 6 - Complete payment on Pi server
    // --------------------------------------------------------
    await piAxios.post(`/payments/${paymentId}/complete`, { txid });
    console.log(`[pay-test-user] Payment completed. TXID: ${txid}`);

    logTransaction({ uid: sanitizedUid, paymentId, txid, status: 'completed' });

    return res.status(200).json({
      success: true,
      txid,
      paymentId,
      message: 'Payment completed successfully.',
    });

  } catch (error: any) {
    const errMsg = resolveErrorMessage(error);
    console.error(`[pay-test-user] Error for UID ${sanitizedUid}:`, error?.response?.data || error.message);

    logTransaction({
      uid: sanitizedUid,
      paymentId,
      txid,
      status: 'failed',
      error: errMsg,
    });

    return res.status(500).json({
      error: 'payment_failed',
      message: errMsg,
      ...(process.env.NODE_ENV === 'development' && { debug: error?.response?.data || error.message }),
    });
  }
}
