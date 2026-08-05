import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getConfig } from './env';

/** Управляет подключением к PostgreSQL через Prisma. */
export class Database {
  readonly pool: Pool;
  readonly prisma: PrismaClient;

  /** Создаёт пул соединений и Prisma-клиент. */
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
    const adapter = new PrismaPg(this.pool);
    this.prisma = new PrismaClient({ adapter });
  }

  /** Проверяет доступность базы с повторными попытками. */
  async connectWithRetry(): Promise<boolean> {
    const { dbConnectMaxAttempts, dbConnectRetryDelayMs } = getConfig();

    for (let attempt = 1; attempt <= dbConnectMaxAttempts; attempt += 1) {
      try {
        const client = await this.pool.connect();
        client.release();
        console.log('Подключение к базе данных установлено');
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Попытка подключения к БД ${attempt}/${dbConnectMaxAttempts} не удалась:`, message);

        if (attempt === dbConnectMaxAttempts) {
          console.error('Не удалось подключиться к базе данных');
          return false;
        }

        await new Promise((resolve) => setTimeout(resolve, dbConnectRetryDelayMs));
      }
    }

    return false;
  }

  /** Проверяет, отвечает ли база данных. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /** Корректно закрывает Prisma и пул соединений. */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pool.end();
  }
}
