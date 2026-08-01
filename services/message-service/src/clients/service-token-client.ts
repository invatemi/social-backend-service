import { ServiceTokenClient } from '../../shared/security/index.js';
import { getConfig } from '../config/env';

let client: ServiceTokenClient | null = null;

/** Returns a singleton service token client for user-service internal API. */
export const getServiceTokenClient = (): ServiceTokenClient => {
  if (!client) {
    const config = getConfig();
    client = new ServiceTokenClient({
      authServiceUrl: config.authServiceUrl,
      clientId: config.serviceClientId,
      clientSecret: config.serviceClientSecret,
      audience: 'user-service',
      timeoutMs: config.userServiceTimeoutMs,
    });
  }

  return client;
};

/** Fetches Authorization header value for internal user-service calls. */
export const getInternalAuthHeader = async (): Promise<string> => {
  const token = await getServiceTokenClient().getAccessToken();
  return `Bearer ${token}`;
};
