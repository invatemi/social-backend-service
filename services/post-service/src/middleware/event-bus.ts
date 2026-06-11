import * as amqp from 'amqplib';
import type { Channel } from 'amqplib';
import { getConfig } from '../config/env';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

export type CommentEventRoutingKey =
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted';

export type PostEventRoutingKey =
  | 'post.created'
  | 'post.updated'
  | 'post.deleted';

export type LikeEventRoutingKey = 'post.liked';

export type EventRoutingKey = CommentEventRoutingKey | PostEventRoutingKey | LikeEventRoutingKey;

export interface CommentEventPayload {
  commentId: number;
  postId: number;
  userId: number;
  postAuthorId: number;
  content?: string;
  commentsCount: number;
  timestamp: string;
}

export interface PostEventPayload {
  postId: number;
  userId: number;
  title: string | null;
  content: string;
  imageUrl: string | null;
  isPublished: boolean;
  likesCount: number;
  commentsCount: number;
  timestamp: string;
}

export interface PostLikedEventPayload {
  postId: number;
  userId: number;
  postAuthorId: number;
  liked: boolean;
  likesCount: number;
  timestamp: string;
}

export type EventPayload = CommentEventPayload | PostEventPayload | PostLikedEventPayload;

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

/** Шина событий для публикации событий post-домена. */
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
    const { rabbitmqUrl, postEventsExchange } = getConfig();

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

    await this.channel.assertExchange(postEventsExchange, 'topic', {
      durable: true,
    });

    console.log('[EventBus] Connected to RabbitMQ');
  }

  /** Подключается к RabbitMQ и объявляет exchange post.events. */
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

  /** Публикует событие в exchange post.events. */
  async publish(
    routingKey: EventRoutingKey,
    payload: EventPayload
  ): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    const channel = this.channel;

    if (!channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    const { postEventsExchange } = getConfig();
    const isPublished = channel.publish(
      postEventsExchange,
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

  /** Закрывает соединение с RabbitMQ. */
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
