import * as amqp from 'amqplib';
import type { Channel } from 'amqplib';
import { getConfig } from '../config/env';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

export type UserRegisteredRoutingKey = 'user.registered';

export interface UserRegisteredPayload {
  userId: number;
  username: string;
  email: string;
  roleId: number;
  timestamp: string;
}

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

/** Шина событий для публикации сообщений в RabbitMQ. */
export class EventBus {
  private static instance: EventBus;
  private connection: AmqpConnection | null = null;
  private channel: Channel | null = null;
  private reconnecting = false;
  private shuttingDown = false;

  private constructor() {}

  /** Возвращает единственный экземпляр шины событий. */
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /** Читает настройки повторных попыток подключения. */
  private getRetryConfig() {
    const config = getConfig();
    return {
      maxAttempts: config.rabbitmqConnectMaxAttempts,
      retryDelayMs: config.rabbitmqConnectRetryDelayMs,
      maxRetryDelayMs: config.rabbitmqConnectMaxRetryDelayMs,
    };
  }

  /** Обрабатывает разрыв соединения с брокером. */
  private handleConnectionClosed(): void {
    this.connection = null;
    this.channel = null;
    if (!this.shuttingDown) {
      this.scheduleReconnect();
    }
  }

  /** Планирует фоновое переподключение к RabbitMQ. */
  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnecting) {
      return;
    }
    this.reconnecting = true;
    void this.reconnectLoop().finally(() => {
      this.reconnecting = false;
    });
  }

  /** Повторяет подключение до успеха или исчерпания попыток. */
  private async reconnectLoop(): Promise<void> {
    const { maxAttempts, retryDelayMs, maxRetryDelayMs } = this.getRetryConfig();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (this.shuttingDown) return;
      try {
        await this.establishConnection();
        return;
      } catch (error) {
        if (attempt === maxAttempts) return;
        await sleep(Math.min(retryDelayMs * attempt, maxRetryDelayMs));
      }
    }
  }

  /** Устанавливает соединение и объявляет exchange. */
  private async establishConnection(): Promise<void> {
    const { rabbitmqUrl, userEventsExchange } = getConfig();

    this.connection = await amqp.connect(rabbitmqUrl);
    this.connection.on('close', () => this.handleConnectionClosed());
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(userEventsExchange, 'topic', { durable: true });
  }

  /** Подключается к RabbitMQ с повторными попытками. */
  async connect(): Promise<void> {
    if (this.channel) return;
    const { maxAttempts, retryDelayMs, maxRetryDelayMs } = this.getRetryConfig();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.establishConnection();
        return;
      } catch (error) {
        this.connection = null;
        this.channel = null;
        if (attempt === maxAttempts) throw error;
        await sleep(Math.min(retryDelayMs * attempt, maxRetryDelayMs));
      }
    }
  }

  /** Публикует событие регистрации пользователя. */
  async publish(routingKey: UserRegisteredRoutingKey, payload: UserRegisteredPayload): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }
    const channel = this.channel;
    if (!channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    const { userEventsExchange } = getConfig();
    channel.publish(userEventsExchange, routingKey, Buffer.from(JSON.stringify(payload)), {
      contentType: 'application/json',
      deliveryMode: 2,
      timestamp: Date.now(),
    });
  }

  /** Закрывает соединение с RabbitMQ. */
  async disconnect(): Promise<void> {
    this.shuttingDown = true;
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } finally {
      this.channel = null;
      this.connection = null;
    }
  }
}

export const eventBus = EventBus.getInstance();
