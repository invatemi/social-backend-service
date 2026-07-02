import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-for-integration-tests';

/** Creates a signed user access token for integration tests. */
export const createTestUserToken = (
  userId: number,
  role: string = 'user'
): string =>
  jwt.sign({ userId, email: `user${userId}@test.local`, role }, TEST_JWT_SECRET, {
    expiresIn: '15m',
  });

/** Returns Authorization header value for integration tests. */
export const testAuthHeader = (userId: number, role?: string): string =>
  `Bearer ${createTestUserToken(userId, role)}`;

process.env.JWT_SECRET = TEST_JWT_SECRET;
