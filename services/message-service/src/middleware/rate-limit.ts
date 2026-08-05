import rateLimit, {
  type Options,
  type RateLimitRequestHandler,
  type Store,
  type ClientRateLimitInfo,
} from 'express-rate-limit';
import { createClient, type RedisClientType } from 'redis';
import { getConfig } from '../config/env';

const rateLimitHandler: Options['handler'] = (req, res, _next, optionsUsed) => {
  const resetTime = (req as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.max(1, Math.ceil(optionsUsed.windowMs / 1000));

  res
    .status(429)
    .set('Retry-After', String(retryAfterSeconds))
    .json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
};

class RedisRateLimitStore implements Store {
  private readonly prefix: string;
  private client: RedisClientType | null = null;
  private connectPromise: Promise<RedisClientType | null> | null = null;
  public windowMs = 60_000;

  constructor(
    private readonly redisUrl: string,
    prefix: string
  ) {
    this.prefix = prefix;
  }

  private async getClient(): Promise<RedisClientType | null> {
    if (this.client?.isOpen) return this.client;
    if (!this.connectPromise) {
      this.connectPromise = (async () => {
        try {
          const client = createClient({ url: this.redisUrl }) as RedisClientType;
          client.on('error', (error) => {
            console.log('[RateLimit Redis] error:', error);
          });
          await client.connect();
          this.client = client;
          return client;
        } catch (error) {
          console.log('[RateLimit Redis] connect failed:', error);
          return null;
        }
      })();
    }
    return this.connectPromise;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const client = await this.getClient();
    if (!client) {
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }

    const redisKey = `${this.prefix}:${key}`;
    const totalHits = await client.incr(redisKey);
    if (totalHits === 1) {
      await client.pExpire(redisKey, this.windowMs);
    }
    const ttl = await client.pTTL(redisKey);
    const resetTime = new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs));
    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    await client.decr(`${this.prefix}:${key}`);
  }

  async resetKey(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    await client.del(`${this.prefix}:${key}`);
  }
}

/** Message send: 60 requests / minute per IP (Redis-backed when REDIS_URL set). */
export const createMessageSendRateLimiter = (): RateLimitRequestHandler => {
  const config = getConfig();
  const windowMs = config.rateLimitSendWindowMs;
  const max = config.rateLimitSendMax;
  const store =
    config.redisUrl.length > 0
      ? new RedisRateLimitStore(config.redisUrl, 'rl:messages:send')
      : undefined;
  if (store) store.windowMs = windowMs;

  return rateLimit({
    windowMs,
    max,
    legacyHeaders: true,
    standardHeaders: false,
    handler: rateLimitHandler,
    ...(store ? { store } : {}),
  });
};
