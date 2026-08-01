import jwt from 'jsonwebtoken';
import { getConfig } from '../../config/env';

export interface ServiceClientCredentials {
  secret: string;
  audiences: Record<string, string[]>;
}

export interface IssueServiceTokenInput {
  clientId: string;
  clientSecret: string;
  audience: string;
}

export interface ServiceTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

const SERVICE_TOKEN_ISSUER = 'auth-service';

/** Resolves registered service clients from environment variables. */
export const getServiceClients = (): Record<string, ServiceClientCredentials> => {
  const clients: Record<string, ServiceClientCredentials> = {};

  const postId = process.env.SERVICE_CLIENT_POST_SERVICE_ID;
  const postSecret = process.env.SERVICE_CLIENT_POST_SERVICE_SECRET;
  if (postId && postSecret) {
    clients[postId] = {
      secret: postSecret,
      audiences: {
        'user-service': ['internal:users:read'],
      },
    };
  }

  const notifId = process.env.SERVICE_CLIENT_NOTIFICATIONS_SERVICE_ID;
  const notifSecret = process.env.SERVICE_CLIENT_NOTIFICATIONS_SERVICE_SECRET;
  if (notifId && notifSecret) {
    clients[notifId] = {
      secret: notifSecret,
      audiences: {
        'user-service': ['internal:users:read'],
      },
    };
  }

  const messageId = process.env.SERVICE_CLIENT_MESSAGE_SERVICE_ID;
  const messageSecret = process.env.SERVICE_CLIENT_MESSAGE_SERVICE_SECRET;
  if (messageId && messageSecret) {
    clients[messageId] = {
      secret: messageSecret,
      audiences: {
        'user-service': ['internal:users:read'],
      },
    };
  }

  return clients;
};

/** Issues a short-lived service JWT for internal API calls. */
export class ServiceTokenService {
  issueToken(input: IssueServiceTokenInput): ServiceTokenResponse {
    const clients = getServiceClients();
    const client = clients[input.clientId];

    if (!client || client.secret !== input.clientSecret) {
      throw new Error('INVALID_CLIENT_CREDENTIALS');
    }

    const scopes = client.audiences[input.audience];
    if (!scopes) {
      throw new Error('INVALID_AUDIENCE');
    }

    const { serviceJwtSecret, serviceJwtTtlSec } = getConfig();

    const accessToken = jwt.sign(
      {
        typ: 'service',
        iss: SERVICE_TOKEN_ISSUER,
        sub: input.clientId,
        aud: input.audience,
        scope: scopes,
      },
      serviceJwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: serviceJwtTtlSec,
      }
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: serviceJwtTtlSec,
    };
  }
}

export const serviceTokenService = new ServiceTokenService();
