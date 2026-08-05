import * as amqp from 'amqplib';
import type { Channel } from 'amqplib';
import { getConfig } from '../config/env';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

export type MessageEventRoutingKey =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'chat.created'
  | 'chat.deleted'
  | 'chat.read';

export interface MessageCreatedPayload {
  id: number;
  chatId: number;
  content: string;
  createdAt: string;
  isRead?: boolean;
  author: {
    id: number;
    username: string;
    avatarUrl: string | null;
  };
  participantIds: number[];
  timestamp: string;
}

export interface ChatCreatedPayload {
  chatId: number;
  participantIds: number[];
  chatName?: string | null;
  isGroup?: boolean;
  timestamp: string;
}

export interface ChatDeletedPayload {
  chatId: number;
  participantIds: number[];
  timestamp: string;
}

export interface ChatReadPayload {
  chatId: number;
  readerId: number;
  lastReadAt: string;
  participantIds: number[];
  timestamp: string;
}

export interface MessageUpdatedPayload extends MessageCreatedPayload {
  editedAt?: string | null;
  forwardedFromId?: number | null;
}

export interface MessageDeletedPayload {
  id: number;
  chatId: number;
  participantIds: number[];
  timestamp: string;
}

export type EventPayload =
  | MessageCreatedPayload
  | MessageUpdatedPayload
  | MessageDeletedPayload
  | ChatCreatedPayload
  | ChatDeletedPayload
  | ChatReadPayload;

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

/** Шина событий для публикации событий messaging-домена. */
export class EventBus {
  private static instance: EventBus;

  private connection: AmqpConnection | null = null;
  private channel: Channel | null = null;
  private reconnecting = false;
  private shuttingDown = false;

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  private getRetryConfig() {
    const config = getConfig();
    return {
      maxAttempts: config.rabbitmqConnectMaxAttempts,
      retryDelayMs: config.rabbitmqConnectRetryDelayMs,
      maxRetryDelayMs: config.rabbitmqConnectMaxRetryDelayMs,
    };
  }

  private handleConnectionClosed(): void {
    console.log('[EventBus] Connection closed');
    this.connection = null;
    this.channel = null;

    if (!this.shuttingDown) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnecting) {
      return;
    }

    this.reconnecting = true;
    void this.reconnectLoop().finally(() => {
      this.reconnecting = false;
    });
  }

  private async reconnectLoop(): Promise<void> {
    const { maxAttempts, retryDelayMs, maxRetryDelayMs } = this.getRetryConfig();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (this.shuttingDown) {
        return;
      }

      try {
        await this.establishConnection();
        console.log('[EventBus] Reconnected to RabbitMQ');
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          console.log('[EventBus] Failed to reconnect to RabbitMQ:', error);
          return;
        }

        const nextDelayMs = Math.min(retryDelayMs * attempt, maxRetryDelayMs);
        await sleep(nextDelayMs);
      }
    }
  }

  private async establishConnection(): Promise<void> {
    const { rabbitmqUrl, messageEventsExchange } = getConfig();

    this.connection = await amqp.connect(rabbitmqUrl);

    this.connection.on('error', (error) => {
      console.log('[EventBus] Connection error:', error);
    });

    this.connection.on('close', () => {
      this.handleConnectionClosed();
    });

    this.channel = await this.connection.createChannel();

    this.channel.on('error', (error) => {
      console.log('[EventBus] Channel error:', error);
    });

    await this.channel.assertExchange(messageEventsExchange, 'topic', {
      durable: true,
    });

    console.log('[EventBus] Connected to RabbitMQ');
  }

  async connect(): Promise<void> {
    if (this.channel) {
      return;
    }

    const { maxAttempts, retryDelayMs, maxRetryDelayMs } = this.getRetryConfig();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.establishConnection();
        return;
      } catch (error) {
        this.connection = null;
        this.channel = null;

        if (attempt === maxAttempts) {
          console.log('[EventBus] Failed to connect to RabbitMQ:', error);
          throw error;
        }

        const nextDelayMs = Math.min(retryDelayMs * attempt, maxRetryDelayMs);
        await sleep(nextDelayMs);
      }
    }
  }

  async publish(routingKey: MessageEventRoutingKey, payload: EventPayload): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    const channel = this.channel;
    if (!channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    const { messageEventsExchange } = getConfig();
    const isPublished = channel.publish(
      messageEventsExchange,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      {
        contentType: 'application/json',
        deliveryMode: 2,
        timestamp: Date.now(),
      }
    );

    if (!isPublished) {
      console.log(`[EventBus] Publish buffer is full for ${routingKey}`);
    }

    console.log(`[EventBus] Published ${routingKey}:`, payload);
  }

  async disconnect(): Promise<void> {
    this.shuttingDown = true;

    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      console.log('[EventBus] Disconnected from RabbitMQ');
    } catch (error) {
      console.log('[EventBus] Failed to disconnect cleanly:', error);
    } finally {
      this.channel = null;
      this.connection = null;
    }
  }
}

export const eventBus = EventBus.getInstance();
