import { Pool } from 'pg';

/** Пул для чтения данных из базы auth-service. */
export class AuthDatabase {
  readonly pool: Pool;

  /** Создаёт пул соединений к auth-базе. */
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /** Закрывает пул соединений. */
  async disconnect(): Promise<void> {
    await this.pool.end();
  }
}
