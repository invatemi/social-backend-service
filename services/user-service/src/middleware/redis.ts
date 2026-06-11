import { createClient } from 'redis';
import { getConfig } from '../config/env';

type RedisClient = ReturnType<typeof createClient>;

/** Кэш на базе Redis с безопасным отключением при недоступности. */
export class RedisCache {
  private readonly client: RedisClient;
  private connectPromise: Promise<RedisClient | null> | null = null;
  private readonly redisUrl: string;
  private readonly connectTimeout: number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;

  /** Создаёт клиент Redis из переменных окружения. */
  constructor() {
    const config = getConfig();
    this.redisUrl = config.redisUrl;
    this.connectTimeout = config.redisConnectTimeoutMs;
    this.reconnectBaseMs = config.redisReconnectBaseMs;
    this.reconnectMaxMs = config.redisReconnectMaxMs;

    this.client = createClient({
      url: this.redisUrl,
      socket: {
        connectTimeout: this.connectTimeout,
        reconnectStrategy: (retries) =>
          Math.min(retries * this.reconnectBaseMs, this.reconnectMaxMs),
      },
    });

    this.client.on('error', (error) => {
      console.log('[Redis] Ошибка клиента:', error);
    });
  }

  /** Возвращает готовый клиент или null, если Redis недоступен. */
  private async getClient(): Promise<RedisClient | null> {
    if (!this.redisUrl) return null;
    if (this.client.isReady) return this.client;

    if (!this.connectPromise) {
      this.connectPromise = this.client
        .connect()
        .then(() => this.client)
        .catch((error) => {
          this.connectPromise = null;
          console.log('[Redis] Не удалось подключиться:', error);
          return null;
        });
    }

    return this.connectPromise;
  }

  /** Читает и парсит JSON-значение из кэша. */
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      if (!client) return null;
      const value = await client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  /** Сохраняет JSON-значение с TTL в секундах. */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      const client = await this.getClient();
      if (!client) return;
      await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch {
      /* кэш не критичен */
    }
  }

  /** Удаляет один ключ из кэша. */
  async del(key: string): Promise<void> {
    try {
      const client = await this.getClient();
      if (!client) return;
      await client.del(key);
    } catch {
      /* кэш не критичен */
    }
  }

  /** Удаляет несколько ключей за один запрос. */
  async delMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      const client = await this.getClient();
      if (!client) return;
      await client.del(keys);
    } catch {
      /* кэш не критичен */
    }
  }

  /** Удаляет ключи по шаблону SCAN. */
  async delPattern(pattern: string): Promise<void> {
    try {
      const client = await this.getClient();
      if (!client) return;
      const keys: string[] = [];
      for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(String(key));
      }
      await this.delMany(keys);
    } catch {
      /* кэш не критичен */
    }
  }

  /** Закрывает соединение с Redis. */
  async disconnect(): Promise<void> {
    if (!this.client.isOpen) return;
    await this.client.quit();
  }
}

export const cache = new RedisCache();
