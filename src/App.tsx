import { useState } from 'react';
import { usePiNetwork } from './hooks/usePiNetwork';

function App() {
  const { user, authenticate, createPayment } = usePiNetwork();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [a2uLoading, setA2ULoading] = useState(false);

  const handleAuth = async () => {
    try {
      setLoading(true);
      setMessage('');
      await authenticate();
      setMessage('Authenticated successfully!');
    } catch (error) {
      setMessage('Failed to authenticate.');
    } finally {
      setLoading(false);
    }
  };

  const handleA2UPayment = async () => {
    if (!user?.uid) return;

    try {
      setA2ULoading(true);
      setMessage('Initiating App-to-User payment (0.1 Test-Pi)...');

      const response = await fetch('/api/pay-test-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid }), // network comes from PI_NETWORK env var
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Payment failed');
      }

      setMessage(`${data.message} TXID: ${data.txid ?? 'N/A'}`);
    } catch (error: unknown) {
      console.error(error);
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setA2ULoading(false);
    }
  };

  const handlePayment = async () => {
    try {
      setLoading(true);
      setMessage('Initiating payment...');
      await createPayment(1, 'Test Payment for LIFE-APP');
      setMessage('Payment flow completed. Check backend logs for final status.');
    } catch (error) {
      setMessage('Payment failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
      <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-purple-600 mb-4">LIFE-APP</h1>

        {!user ? (
          <>
            <p className="text-gray-600 mb-8">
              Welcome to Pi Network Integration
            </p>
            <button
              onClick={handleAuth}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-bold py-2 px-4 rounded-lg w-full transition-colors"
            >
              {loading ? 'Connecting...' : 'Connect Pi Wallet'}
            </button>
          </>
        ) : (
          <>
            <p className="text-green-600 font-semibold mb-4">
              Welcome, @{user.username}!
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-6 text-sm text-left border">
              <p><strong>UID:</strong> {user.uid}</p>
              <p><strong>Roles:</strong> {user.roles?.join(', ')}</p>
            </div>
            <button
              onClick={handlePayment}
              disabled={loading || a2uLoading}
              className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-bold py-2 px-4 rounded-lg w-full transition-colors"
            >
              {loading ? 'Processing...' : 'Pay 1 Pi (Test)'}
            </button>
            <button
              onClick={handleA2UPayment}
              disabled={a2uLoading || loading || !user.uid}
              className="mt-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-bold py-2 px-4 rounded-lg w-full transition-colors"
            >
              {a2uLoading ? 'Sending Pi...' : 'Receive 0.1 Test-Pi (A2U)'}
            </button>
          </>
        )}

        {message && (
          <p className="mt-4 text-sm text-gray-700 font-medium">{message}</p>
        )}
      </div>
    </div>
  );
}

export default App;
