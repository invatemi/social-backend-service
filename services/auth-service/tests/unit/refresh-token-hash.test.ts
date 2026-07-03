import crypto from 'crypto';
import {
  computeLookupHash,
  computeTokenHash,
  hashRefreshToken,
  verifyRefreshTokenHash,
} from '../../src/lib/refresh-token-hash';

const PEPPER = 'test-pepper-at-least-32-characters-long';
const TOKEN = 'a'.repeat(32);

describe('refresh-token-hash', () => {
  it('computeLookupHash: детерминирован для одного token + pepper', () => {
    const first = computeLookupHash(TOKEN, PEPPER);
    const second = computeLookupHash(TOKEN, PEPPER);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('computeLookupHash: разный pepper даёт разный hash', () => {
    const first = computeLookupHash(TOKEN, PEPPER);
    const second = computeLookupHash(TOKEN, 'other-pepper-at-least-32-characters');
    expect(first).not.toBe(second);
  });

  it('hashRefreshToken: разные соли дают разные tokenHash', () => {
    jest.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.alloc(16, 1) as any);
    const first = hashRefreshToken(TOKEN, PEPPER);

    jest.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.alloc(16, 2) as any);
    const second = hashRefreshToken(TOKEN, PEPPER);

    expect(first.tokenLookupHash).toBe(second.tokenLookupHash);
    expect(first.tokenHash).not.toBe(second.tokenHash);
    expect(first.tokenSalt).not.toBe(second.tokenSalt);
  });

  it('verifyRefreshTokenHash: true для корректного токена', () => {
    const salt = 'abc123';
    const hash = computeTokenHash(TOKEN, salt);
    expect(verifyRefreshTokenHash(TOKEN, salt, hash)).toBe(true);
  });

  it('verifyRefreshTokenHash: false для неверного токена', () => {
    const salt = 'abc123';
    const hash = computeTokenHash(TOKEN, salt);
    expect(verifyRefreshTokenHash('b'.repeat(32), salt, hash)).toBe(false);
  });

  it('verifyRefreshTokenHash: false при неверной длине hash', () => {
    expect(verifyRefreshTokenHash(TOKEN, 'salt', 'short')).toBe(false);
  });
});
