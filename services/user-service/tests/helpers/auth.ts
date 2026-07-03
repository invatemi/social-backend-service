import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-for-integration-tests';
const TEST_JWT_ISSUER = process.env.JWT_ISSUER ?? 'social-auth-service';
const TEST_JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'social-api';

/** Creates a signed user access token for integration tests. */
export const createTestUserToken = (
  userId: number,
  role: string = 'user'
): string =>
  jwt.sign(
    { userId, email: `user${userId}@test.local`, role, typ: 'user' },
    TEST_JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: TEST_JWT_ISSUER,
      audience: TEST_JWT_AUDIENCE,
      expiresIn: '15m',
    }
  );

/** Returns Authorization header value for integration tests. */
export const testAuthHeader = (userId: number, role?: string): string =>
  `Bearer ${createTestUserToken(userId, role)}`;

process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_ISSUER = TEST_JWT_ISSUER;
process.env.JWT_AUDIENCE = TEST_JWT_AUDIENCE;
