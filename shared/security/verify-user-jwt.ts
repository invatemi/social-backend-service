import jwt from 'jsonwebtoken';
import { UserJwtPayload } from './types.js';

export interface VerifyUserJwtOptions {
  getJwtSecret: () => string;
  clockToleranceSec?: number;
  expectedIssuer?: string;
  expectedAudience?: string;
  claimsStrict?: boolean;
}

const matchesAudience = (aud: string | string[] | undefined, expected: string): boolean => {
  if (!aud) {
    return false;
  }
  if (Array.isArray(aud)) {
    return aud.includes(expected);
  }
  return aud === expected;
};

/** Validates user JWT signature, algorithm, and standard claims. */
export const verifyUserJwt = (token: string, options: VerifyUserJwtOptions): UserJwtPayload => {
  const clockTolerance = options.clockToleranceSec ?? 30;
  const claimsStrict = options.claimsStrict ?? false;

  const payload = jwt.verify(token, options.getJwtSecret(), {
    algorithms: ['HS256'],
    clockTolerance,
    issuer: claimsStrict ? options.expectedIssuer : undefined,
    audience: claimsStrict ? options.expectedAudience : undefined,
  }) as UserJwtPayload;

  if (payload.typ === 'service') {
    throw new UserJwtClaimError('Forbidden: service token cannot be used for user context');
  }

  if (payload.typ !== 'user') {
    if (claimsStrict) {
      throw new UserJwtClaimError('Forbidden: invalid user token type');
    }
    console.warn('[Security] legacy token without typ:user');
  }

  if (options.expectedIssuer) {
    if (!payload.iss) {
      if (claimsStrict) {
        throw new UserJwtClaimError('Forbidden: missing token issuer');
      }
      console.warn('[Security] legacy token without iss claim');
    } else if (payload.iss !== options.expectedIssuer) {
      if (claimsStrict) {
        throw new UserJwtClaimError('Forbidden: invalid token issuer');
      }
      console.warn('[Security] legacy token with unexpected iss claim');
    }
  }

  if (options.expectedAudience) {
    if (!matchesAudience(payload.aud, options.expectedAudience)) {
      if (claimsStrict) {
        throw new UserJwtClaimError('Forbidden: invalid token audience');
      }
      console.warn('[Security] legacy token without or with unexpected aud claim');
    }
  }

  if (!payload.userId || !Number.isInteger(payload.userId) || payload.userId <= 0) {
    throw new UserJwtClaimError('Forbidden: invalid user token');
  }

  return payload;
};

export class UserJwtClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserJwtClaimError';
  }
}
