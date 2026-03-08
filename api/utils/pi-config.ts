/**
 * Pi Network configuration utility.
 * Selects the correct API key and App ID based on the network parameter
 * sent from the frontend ('pi_testnet' | 'pi_mainnet').
 *
 * Environment variables required:
 *   PI_API_KEY_TESTNET  — Server API key for the Testnet app
 *   PI_API_KEY_MAINNET  — Server API key for the Mainnet app
 */

export const PI_BASE_URL = 'https://api.minepi.com/v2';

/** The two Pi Network environments supported by this application. */
export type PiNetwork = 'pi_testnet' | 'pi_mainnet';

/** Allowed network values for runtime validation. */
const VALID_NETWORKS: ReadonlySet<string> = new Set<PiNetwork>([
  'pi_testnet',
  'pi_mainnet',
]);

export interface PiConfig {
  /** Server-side API key for the chosen network. */
  apiKey: string;
  /** Pi Developer Portal App ID for the chosen network. */
  appId: string;
  /** Base URL for the Pi Platform API. */
  baseUrl: string;
  /** Which network was resolved. */
  network: PiNetwork;
}

/**
 * Returns the Pi Network configuration for the requested network.
 * Throws if the network value is invalid or the env var is missing.
 *
 * @param network - 'pi_testnet' or 'pi_mainnet'
 */
export function getPiConfig(network: string): PiConfig {
  if (!VALID_NETWORKS.has(network)) {
    throw new Error(
      `Invalid network "${network}". Must be "pi_testnet" or "pi_mainnet".`
    );
  }

  if (network === 'pi_mainnet') {
    const apiKey = process.env.PI_API_KEY_MAINNET;
    if (!apiKey) {
      throw new Error(
        'PI_API_KEY_MAINNET environment variable is not configured'
      );
    }
    return {
      apiKey,
      appId: 'life-app-c468e9eb5bf115fa',
      baseUrl: PI_BASE_URL,
      network: 'pi_mainnet',
    };
  }

  // Default: testnet
  const apiKey = process.env.PI_API_KEY_TESTNET;
  if (!apiKey) {
    throw new Error(
      'PI_API_KEY_TESTNET environment variable is not configured'
    );
  }
  return {
    apiKey,
    appId: 'life-app',
    baseUrl: PI_BASE_URL,
    network: 'pi_testnet',
  };
}

/**
 * Returns the Authorization header object for Pi Platform API requests.
 */
export function getAuthHeaders(
  apiKey: string
): Record<string, string> {
  return { Authorization: `Key ${apiKey}` };
}
