import type { Server } from 'http';

type ShutdownTask = () => Promise<void>;

/** Регистрирует graceful shutdown для HTTP-сервера. */
export const registerShutdown = (server: Server, tasks: ShutdownTask[]): void => {
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`${signal} received`);

    server.close(async () => {
      try {
        for (const task of tasks) {
          await task();
        }
        process.exit(0);
      } catch (error) {
        console.log('Ошибка при завершении работы:', error);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};
