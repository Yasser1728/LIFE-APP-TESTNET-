import { useEffect, useState, useCallback } from 'react';

// ============================================================
// API ENDPOINTS - Vercel Serverless Functions
// ============================================================
const API_ENDPOINTS = {
  PAY: '/api/pay-test-user',
  COMPLETE: '/api/complete-payment',
};
// ============================================================
// CONSTANTS
// ============================================================
const PI_SCOPES = ['payments', 'username'];
const PAYMENT_AMOUNT = 0.1;
const IS_SANDBOX = import.meta.env.VITE_PI_SANDBOX !== 'false';

const STATUS_TYPES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
};

// ============================================================
// HELPER - Handle incomplete payments
// ============================================================
async function handleIncompletePayment(payment) {
  console.warn('[Pi] Incomplete payment detected:', payment);
  try {
    const res = await fetch(API_ENDPOINTS.COMPLETE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: payment.identifier,
        txid: payment.transaction?.txid || '',
      }),
    });
    const data = await res.json();
    if (data.success) {
      console.log('[Pi] Incomplete payment resolved. TXID:', data.txid);
    }
  } catch (err) {
    console.error('[Pi] Failed to resolve incomplete payment:', err.message);
  }
}

// ============================================================
// SUB COMPONENTS
// ============================================================

function StatusBadge({ type, message }) {
  if (!message) return null;

  const styles = {
    [STATUS_TYPES.SUCCESS]: {
      bg: '#e6f9f0',
      border: '#34d399',
      color: '#065f46',
      icon: '✓',
    },
    [STATUS_TYPES.ERROR]: {
      bg: '#fff1f2',
      border: '#fb7185',
      color: '#9f1239',
      icon: '✕',
    },
    [STATUS_TYPES.WARNING]: {
      bg: '#fffbeb',
      border: '#fbbf24',
      color: '#92400e',
      icon: '⚠',
    },
    [STATUS_TYPES.LOADING]: {
      bg: '#eff6ff',
      border: '#60a5fa',
      color: '#1e3a5f',
      icon: '…',
    },
  };

  const s = styles[type] || styles[STATUS_TYPES.LOADING];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        marginTop: '18px',
        padding: '12px 16px',
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: '10px',
        fontSize: '14px',
        color: s.color,
        lineHeight: '1.5',
        wordBreak: 'break-all',
        textAlign: 'left',
      }}
    >
      <span style={{ fontWeight: 'bold', fontSize: '16px', flexShrink: 0 }}>{s.icon}</span>
      <span>{message}</span>
    </div>
  );
}

function NoBrowserWarning() {
  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: '#fff8e1',
        border: '1px solid #ffd54f',
        borderRadius: '12px',
        color: '#6d4c00',
        fontSize: '14px',
        textAlign: 'center',
        lineHeight: '1.6',
      }}
    >
      <div style={{ fontSize: '28px', marginBottom: '8px' }}>🌐</div>
      <strong>Pi Browser Required</strong>
      <br />
      Please open this app inside the Pi Browser to continue.
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function PiPayment() {
  const [uid, setUid] = useState(null);
  const [username, setUsername] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState(STATUS_TYPES.IDLE);
  const [isPiBrowser, setIsPiBrowser] = useState(true);

  // ---- Check Pi Browser and authenticate ----
  useEffect(() => {
    const initPi = async () => {
      if (typeof window === 'undefined') return;

      // Check if running inside Pi Browser
      if (!window.Pi) {
        setIsPiBrowser(false);
        setAuthLoading(false);
        return;
      }

      try {
        window.Pi.init({ version: '2.0', sandbox: IS_SANDBOX });

        const auth = await window.Pi.authenticate(
          PI_SCOPES,
          handleIncompletePayment // Actually handles incomplete payments
        );

        if (auth?.user?.uid) {
          setUid(auth.user.uid);
          setUsername(auth.user.username || null);
          console.log('[Pi] Authenticated UID:', auth.user.uid);
        } else {
          throw new Error('No user data received from Pi authentication.');
        }
      } catch (error) {
        console.error('[Pi] Authentication failed:', error.message);
        setStatusMsg('Authentication failed. Please use the Pi Browser.');
        setStatusType(STATUS_TYPES.ERROR);
      } finally {
        setAuthLoading(false);
      }
    };

    initPi();
  }, []);

  // ---- Handle payment ----
  const handlePayment = useCallback(async () => {
    if (!uid || loading) return;

    setLoading(true);
    setStatusMsg('Processing payment...');
    setStatusType(STATUS_TYPES.LOADING);

    try {
      const response = await fetch(API_ENDPOINTS.PAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });

      const data = await response.json();

      if (response.status === 429) {
        setStatusMsg('Too many requests. Please wait a minute and try again.');
        setStatusType(STATUS_TYPES.WARNING);
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Payment failed.');
      }

      setStatusMsg(`Payment successful! TXID: ${data.txid}`);
      setStatusType(STATUS_TYPES.SUCCESS);
    } catch (error) {
      console.error('[Pi Payment] Error:', error.message);
      setStatusMsg(error.message || 'An unexpected error occurred.');
      setStatusType(STATUS_TYPES.ERROR);
    } finally {
      setLoading(false);
    }
  }, [uid, loading]);

  // ---- Render: Not Pi Browser ----
  if (!isPiBrowser) {
    return (
      <div style={containerStyle}>
        <NoBrowserWarning />
      </div>
    );
  }

  // ---- Button label ----
  const buttonLabel = authLoading
    ? 'Authenticating...'
    : !uid
    ? 'Authentication Failed'
    : loading
    ? 'Sending Pi...'
    : `Receive ${PAYMENT_AMOUNT} Test-Pi`;

  const isDisabled = authLoading || !uid || loading;

  return (
    <div style={containerStyle}>
      {/* Card header */}
      <div style={headerStyle}>
        <div style={piLogoStyle}>π</div>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#1a1a2e' }}>
            Pi Testnet Payment
          </h2>
          {username && (
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6b7280' }}>
              @{username}
            </p>
          )}
        </div>
      </div>

      {/* Payment details */}
      <div style={detailsBoxStyle}>
        <div style={detailRowStyle}>
          <span style={detailLabelStyle}>Amount</span>
          <span style={detailValueStyle}>{PAYMENT_AMOUNT} π</span>
        </div>
        <div style={detailRowStyle}>
          <span style={detailLabelStyle}>Network</span>
          <span style={{ ...detailValueStyle, color: '#f59e0b', fontSize: '12px' }}>
            Testnet
          </span>
        </div>
        <div style={{ ...detailRowStyle, border: 'none', paddingBottom: 0 }}>
          <span style={detailLabelStyle}>Status</span>
          <span
            style={{
              ...detailValueStyle,
              color: uid ? '#10b981' : '#9ca3af',
              fontSize: '12px',
            }}
          >
            {authLoading ? 'Verifying...' : uid ? 'Authenticated ✓' : 'Not Authenticated'}
          </span>
        </div>
      </div>

      {/* Payment button */}
      <button
        onClick={handlePayment}
        disabled={isDisabled}
        style={{
          ...buttonStyle,
          backgroundColor: isDisabled ? '#d1d5db' : '#7c3aed',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          transform: loading ? 'scale(0.98)' : 'scale(1)',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (!isDisabled) e.currentTarget.style.backgroundColor = '#6d28d9';
        }}
        onMouseLeave={(e) => {
          if (!isDisabled) e.currentTarget.style.backgroundColor = '#7c3aed';
        }}
      >
        {loading && <span style={spinnerStyle} />}
        {buttonLabel}
      </button>

      {/* Status message */}
      <StatusBadge type={statusType} message={statusMsg} />
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const containerStyle = {
  maxWidth: '380px',
  margin: '40px auto',
  padding: '28px 24px',
  backgroundColor: '#ffffff',
  borderRadius: '20px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  fontFamily: "'Segoe UI', Tahoma, sans-serif",
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  marginBottom: '22px',
};

const piLogoStyle = {
  width: '46px',
  height: '46px',
  borderRadius: '50%',
  backgroundColor: '#7c3aed',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '22px',
  fontWeight: 'bold',
  flexShrink: 0,
};

const detailsBoxStyle = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  padding: '14px 16px',
  marginBottom: '20px',
};

const detailRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: '10px',
  marginBottom: '10px',
  borderBottom: '1px solid #e5e7eb',
};

const detailLabelStyle = {
  fontSize: '13px',
  color: '#6b7280',
};

const detailValueStyle = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#1a1a2e',
};

const buttonStyle = {
  width: '100%',
  padding: '14px',
  color: '#fff',
  border: 'none',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: '700',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  letterSpacing: '0.3px',
};

const spinnerStyle = {
  width: '16px',
  height: '16px',
  border: '2px solid rgba(255,255,255,0.4)',
  borderTop: '2px solid #fff',
  borderRadius: '50%',
  display: 'inline-block',
  animation: 'spin 0.8s linear infinite',
};
