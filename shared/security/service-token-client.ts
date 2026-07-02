export interface ServiceTokenClientOptions {
  authServiceUrl: string;
  clientId: string;
  clientSecret: string;
  audience: string;
  timeoutMs?: number;
  refreshSkewSec?: number;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/** Fetches and caches short-lived service JWTs from auth-service. */
export class ServiceTokenClient {
  private readonly options: Required<Pick<ServiceTokenClientOptions, 'timeoutMs' | 'refreshSkewSec'>> &
    ServiceTokenClientOptions;
  private cache: CachedToken | null = null;

  constructor(options: ServiceTokenClientOptions) {
    this.options = {
      timeoutMs: 3000,
      refreshSkewSec: 30,
      ...options,
    };
  }

  /** Returns a valid service access token, refreshing proactively before expiry. */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAtMs - this.options.refreshSkewSec * 1000 > now) {
      return this.cache.accessToken;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(`${this.options.authServiceUrl}/api/auth/internal/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          audience: this.options.audience,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Service token request failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };

      if (!data.access_token) {
        throw new Error('Service token response missing access_token');
      }

      const expiresInSec = data.expires_in ?? 300;
      this.cache = {
        accessToken: data.access_token,
        expiresAtMs: now + expiresInSec * 1000,
      };

      return data.access_token;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Clears the in-memory token cache (useful after 401 retry). */
  clearCache(): void {
    this.cache = null;
  }
}
