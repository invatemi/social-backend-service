import crypto from 'crypto';

const SALT_BYTES = 16;

export interface HashedRefreshToken {
  tokenLookupHash: string;
  tokenHash: string;
  tokenSalt: string;
}

const sha256Hex = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

/** Детерминированный lookup-хэш для O(1) поиска записи в БД. */
export const computeLookupHash = (token: string, pepper: string): string =>
  sha256Hex(`${pepper}${token}`);

/** Вычисляет token_hash = SHA256(token + salt). */
export const computeTokenHash = (token: string, salt: string): string =>
  sha256Hex(`${token}${salt}`);

/** Хэширует refresh token: соль, verification hash и lookup hash. */
export const hashRefreshToken = (token: string, pepper: string): HashedRefreshToken => {
  const tokenSalt = crypto.randomBytes(SALT_BYTES).toString('hex');
  return {
    tokenLookupHash: computeLookupHash(token, pepper),
    tokenHash: computeTokenHash(token, tokenSalt),
    tokenSalt,
  };
};

/** Сравнивает входящий токен с сохранённым хэшем (timing-safe). */
export const verifyRefreshTokenHash = (
  token: string,
  salt: string,
  storedHash: string,
): boolean => {
  const computed = computeTokenHash(token, salt);
  const computedBuffer = Buffer.from(computed, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (computedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, storedBuffer);
};
