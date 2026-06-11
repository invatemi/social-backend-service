import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/** Управляет подключением к PostgreSQL через Prisma. */
export class Database {
  readonly pool: Pool;
  readonly prisma: PrismaClient;

  /** Создаёт пул соединений и Prisma-клиент. */
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    const adapter = new PrismaPg(this.pool);
    this.prisma = new PrismaClient({ adapter });
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
