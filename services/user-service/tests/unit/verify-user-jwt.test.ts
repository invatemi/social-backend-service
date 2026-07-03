import jwt from 'jsonwebtoken';
import {
  UserJwtClaimError,
  verifyUserJwt,
} from '../../shared/security/verify-user-jwt';

const USER_SECRET = 'test-user-jwt-secret-at-least-32-characters';
const ISSUER = 'social-auth-service';
const AUDIENCE = 'social-api';

const baseOptions = {
  getJwtSecret: () => USER_SECRET,
  clockToleranceSec: 30,
  expectedIssuer: ISSUER,
  expectedAudience: AUDIENCE,
};

const signUserToken = (payload: Record<string, unknown>, secret = USER_SECRET): string =>
  jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: '15m',
  });

describe('verifyUserJwt', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts a valid user token', () => {
    const token = signUserToken({ userId: 42, role: 'user', typ: 'user' });
    const payload = verifyUserJwt(token, { ...baseOptions, claimsStrict: true });
    expect(payload.userId).toBe(42);
  });

  it('rejects service token', () => {
    const token = jwt.sign(
      { typ: 'service', sub: 'post-service', aud: 'user-service', scope: [] },
      USER_SECRET,
      { algorithm: 'HS256', expiresIn: '5m' }
    );

    expect(() => verifyUserJwt(token, baseOptions)).toThrow(UserJwtClaimError);
  });

  it('rejects RS256 token', () => {
    const token = jwt.sign(
      { userId: 1, typ: 'user' },
      USER_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' }
    );
    const parts = token.split('.');
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const forged = `${header}.${parts[1]}.${parts[2]}`;

    expect(() => verifyUserJwt(forged, baseOptions)).toThrow();
  });

  it('allows legacy token without iss/aud when claimsStrict=false', () => {
    const token = jwt.sign({ userId: 7, role: 'user' }, USER_SECRET, {
      algorithm: 'HS256',
      expiresIn: '15m',
    });

    const payload = verifyUserJwt(token, { ...baseOptions, claimsStrict: false });
    expect(payload.userId).toBe(7);
    expect(console.warn).toHaveBeenCalled();
  });

  it('rejects legacy token without iss/aud when claimsStrict=true', () => {
    const token = jwt.sign({ userId: 7, role: 'user', typ: 'user' }, USER_SECRET, {
      algorithm: 'HS256',
      expiresIn: '15m',
    });

    expect(() => verifyUserJwt(token, { ...baseOptions, claimsStrict: true })).toThrow();
  });
});
