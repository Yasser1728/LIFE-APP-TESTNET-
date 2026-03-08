# 🚀 LIFE-APP: Pi Network Full-Stack Integration

## 📌 Description

A production-ready template for building Pi Network applications using React, Vite, Tailwind CSS, and Vercel Serverless Functions. This project eliminates the need for third-party tunneling like `ngrok` by running everything directly on Vercel.

## ✨ Features

- **Frontend**: React + Vite + TypeScript
- **UI**: Styled with Tailwind CSS
- **Backend**: Vercel Serverless Functions
- **Pi SDK**: Integrated with Pi SDK v2
- **A2U Payments**: Full App-to-User payment flow using Stellar SDK directly
- **Testnet & Mainnet**: Controlled via environment variables
- **Domain Verification**: `public/validation-key.txt` contains both Testnet and Mainnet keys

## 📁 Project Structure

```
LIFE-APP/
├── api/
│   ├── pay-test-user.ts       # A2U payment: create → build → sign → submit → complete
│   ├── approve-payment.ts     # Approves a U2A payment
│   └── complete-payment.ts    # Completes a pending/incomplete payment
├── src/
│   ├── components/
│   │   └── PiPayment.jsx      # Pi payment UI component
│   └── hooks/
│       └── usePiNetwork.ts    # Pi SDK authentication & payment hook
├── public/
│   └── validation-key.txt     # Pi domain verification keys
├── .env.example               # Environment variables template
├── package.json               # Dependencies including stellar-sdk
└── vercel.json                # Vercel configuration
```

## 🛠️ Setup & Deployment (Vercel)

### 1. Import the Repository
Go to [Vercel](https://vercel.com/) and import this GitHub repository.

### 2. Environment Variables
Add the following in Vercel → **Settings** → **Environment Variables**:

| Variable | Production | Preview/Dev | Description |
|---|---|---|---|
| `PI_NETWORK` | `mainnet` | `testnet` | Active network |
| `PI_API_KEY_TESTNET` | ✅ | ✅ | API key from Pi Developer Portal (Testnet) |
| `PI_API_KEY_MAINNET` | ✅ | ✅ | API key from Pi Developer Portal (Mainnet) |
| `PI_APP_WALLET_SEED_TESTNET` | ✅ | ✅ | Testnet wallet seed starting with `S` |
| `PI_APP_WALLET_SEED_MAINNET` | ✅ | — | Mainnet wallet seed (after Pi approves wallet) |
| `VITE_PI_SANDBOX` | `false` | `true` | Controls Pi SDK sandbox mode |

> ⚠️ **Never commit real `.env` values to GitHub.**

### 3. Deploy
Click the **Deploy** button. Vercel will automatically install all dependencies including `stellar-sdk`.

## 🔌 Pi Developer Portal Configuration

Once deployed on Vercel, copy your domain (e.g., `https://your-app.vercel.app`) and configure:

- **App URL**: `https://your-app.vercel.app`
- **Backend URL**: `https://your-app.vercel.app`
- Click **Verify Domain** for both Testnet and Mainnet apps

## 💳 A2U Payment Flow

The `pay-test-user.ts` follows the official Pi Network integration guide:

```
STEP 1 → POST /v2/payments          → get paymentId + recipientAddress
STEP 2 → loadAccount                → Stellar SDK (always load fresh)
STEP 3 → buildTransaction           → networkPassphrase = "Pi Testnet" or "Pi Network"
STEP 4 → signTransaction            → sign with wallet seed
STEP 5 → submitTransaction          → get txid from Pi blockchain
STEP 6 → POST /v2/payments/complete → finalize with paymentId + txid
```

## 🔗 API Endpoints

### `POST /api/pay-test-user`
Initiates a full A2U payment flow.

**Request:**
```json
{ "uid": "user_pi_uid_here" }
```

**Response:**
```json
{ "success": true, "txid": "...", "paymentId": "..." }
```

---

### `POST /api/approve-payment`
Approves a U2A payment (called by Pi SDK `onReadyForServerApproval`).

**Request:**
```json
{ "paymentId": "..." }
```

**Response:**
```json
{ "success": true, "message": "Payment approved successfully." }
```

---

### `POST /api/complete-payment`
Completes a pending or incomplete payment.

**Request:**
```json
{ "paymentId": "...", "txid": "..." }
```

**Response:**
```json
{ "success": true, "txid": "..." }
```

## 💻 Local Development

```bash
npm install
npm run dev
```

> **Note:** Pi SDK only works inside the Pi Browser. Test using your live Vercel URL.

## 🔒 Security Notes

- Rate limiting on all endpoints (in-memory — replace with [Upstash Redis](https://upstash.com/) in production)
- Double-spend protection enforced in-memory and by Pi Network API
- API key and wallet seed selected automatically based on `PI_NETWORK`
- Error details only exposed in `development` mode
- Wallet seed never exposed to frontend

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `stellar-sdk` | Build, sign, and submit Pi blockchain transactions |
| `axios` | HTTP requests to Pi API |
| `react` + `vite` | Frontend framework and build tool |
| `@vercel/node` | Vercel Serverless Functions types |
