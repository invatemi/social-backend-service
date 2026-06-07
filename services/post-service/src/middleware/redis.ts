import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;
const connectTimeout = Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 5000);

const redisClient = createClient({
  url: redisUrl,
  socket: {
    connectTimeout,
    reconnectStrategy: (retries) => Math.min(retries * 100, 2000),
  },
});

redisClient.on('error', (error) => {
  console.log('[Redis] Client error:', error);
});

type RedisClient = typeof redisClient;

let connectPromise: Promise<RedisClient | null> | null = null;

const getRedisClient = async (): Promise<RedisClient | null> => {
  if (!redisUrl) {
    return null;
  }

  if (redisClient.isReady) {
    return redisClient;
  }

  if (!connectPromise) {
    connectPromise = redisClient
      .connect()
      .then(() => redisClient as RedisClient)
      .catch((error) => {
        connectPromise = null;
        console.log('[Redis] Connection failed:', error);
        return null;
      });
  }

  return connectPromise;
};

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await getRedisClient();
      if (!client) return null;

      const value = await client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      console.log(`[Redis] Failed to get key ${key}:`, error);
      return null;
    }
  },

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      const client = await getRedisClient();
      if (!client) return;

      await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch (error) {
      console.log(`[Redis] Failed to set key ${key}:`, error);
    }
  },

  async del(key: string): Promise<void> {
    try {
      const client = await getRedisClient();
      if (!client) return;

      await client.del(key);
    } catch (error) {
      console.log(`[Redis] Failed to delete key ${key}:`, error);
    }
  },

  async delMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    try {
      const client = await getRedisClient();
      if (!client) return;

      await client.del(keys);
    } catch (error) {
      console.log('[Redis] Failed to delete keys:', error);
    }
  },

  async delPattern(pattern: string): Promise<void> {
    try {
      const client = await getRedisClient();
      if (!client) return;

      const keys: string[] = [];
      for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(String(key));
      }

      await this.delMany(keys);
    } catch (error) {
      console.log(`[Redis] Failed to delete keys by pattern ${pattern}:`, error);
    }
  },

  async disconnect(): Promise<void> {
    if (!redisClient.isOpen) return;
    await redisClient.quit();
  },
};
