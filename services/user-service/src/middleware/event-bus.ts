import * as amqp from 'amqplib';
import type { Channel, ConsumeMessage } from 'amqplib';
import { getConfig } from '../config/env';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export type UserEventRoutingKey =
  | 'friend.requested'
  | 'friend.accepted'
  | 'friend.removed'
  | 'friend.cancelled'
  | 'friend.declined'
  | 'follow.created'
  | 'follow.deleted'
  | 'user.updated'
  | 'user.registered';

export interface UserSummary {
  id: number;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface FriendRequestedPayload {
  requestId: number;
  fromUser: UserSummary;
  toUser: UserSummary;
  timestamp: string;
}

export interface FriendAcceptedPayload {
  requestId: number;
  friendshipId: number;
  fromUser: UserSummary;
  toUser: UserSummary;
  timestamp: string;
}

export interface FriendRemovedPayload {
  initiatorUser: UserSummary;
  targetUser: UserSummary;
  movedToFollowing: boolean;
  timestamp: string;
}

export interface FriendStatusPayload {
  requestId: number;
  fromUser: UserSummary;
  toUser: UserSummary;
  timestamp: string;
}

export interface FollowPayload {
  followerUser: UserSummary;
  followingUser: UserSummary;
  timestamp: string;
}

export interface UserUpdatedPayload {
  userId: number;
  changedFields: string[];
  user: UserSummary & {
    bio?: string | null;
    location?: string | null;
  };
  timestamp: string;
}

export interface UserRegisteredPayload {
  userId: number;
  username: string;
  email: string;
  roleId: number;
  timestamp: string;
}

export type UserEventPayload =
  | FriendRequestedPayload
  | FriendAcceptedPayload
  | FriendRemovedPayload
  | FriendStatusPayload
  | FollowPayload
  | UserUpdatedPayload
  | UserRegisteredPayload;

export interface MessageControls {
  ack: () => void;
  nack: (requeue?: boolean) => void;
}

export type EventHandler = (
  message: ConsumeMessage,
  controls: MessageControls
) => Promise<void> | void;

export interface SubscribeOptions {
  exchangeName: string;
  exchangeType?: 'topic' | 'direct' | 'fanout' | 'headers';
  routingKey: string;
}

interface StoredSubscription {
  queueName: string;
  handler: EventHandler;
  options?: SubscribeOptions;
}

/** Шина событий для публикации и подписки на события user-домена. */
export class EventBus {
  private static instance: EventBus;

  private connection: AmqpConnection | null = null;
  private channel: Channel | null = null;
  private subscriptions: StoredSubscription[] = [];
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
        await this.resubscribeAll();

        console.log(
          `[EventBus] Reconnected to RabbitMQ and restored ${this.subscriptions.length} subscription(s)`
        );
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          console.log('[EventBus] Failed to reconnect to RabbitMQ:', error);
          return;
        }

        const nextDelayMs = Math.min(retryDelayMs * attempt, maxRetryDelayMs);

        console.warn(
          `[EventBus] Reconnect attempt ${attempt}/${maxAttempts} failed. Retrying in ${nextDelayMs}ms:`,
          error
        );

        await sleep(nextDelayMs);
      }
    }
  }

  private async establishConnection(): Promise<void> {
    const { rabbitmqUrl, userEventsExchange, rabbitmqPrefetchCount } = getConfig();

    this.connection = await amqp.connect(rabbitmqUrl);

    this.connection.on('error', (error) => {
      console.log('[EventBus] Connection error:', error);
    });

    this.connection.on('close', () => {
      this.handleConnectionClosed();
    });

    this.channel = await this.connection.createChannel();
    await this.channel.prefetch(rabbitmqPrefetchCount);

    this.channel.on('error', (error) => {
      console.log('[EventBus] Channel error:', error);
    });

    await this.channel.assertExchange(userEventsExchange, 'topic', {
      durable: true,
    });

    console.log('[EventBus] Connected to RabbitMQ');
  }

  private async resubscribeAll(): Promise<void> {
    for (const subscription of this.subscriptions) {
      await this.attachConsumer(
        subscription.queueName,
        subscription.handler,
        subscription.options
      );
    }
  }

  /** Подключается к RabbitMQ и объявляет exchange user.events. */
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

        console.warn(
          `[EventBus] RabbitMQ connection attempt ${attempt}/${maxAttempts} failed. Retrying in ${nextDelayMs}ms:`,
          error
        );

        await sleep(nextDelayMs);
      }
    }
  }

  /** Публикует событие в exchange user.events. */
  async publish(
    routingKey: UserEventRoutingKey,
    payload: UserEventPayload
  ): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    const channel = this.channel;

    if (!channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    const { userEventsExchange } = getConfig();
    const isPublished = channel.publish(
      userEventsExchange,
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

  private async attachConsumer(
    queueName: string,
    handler: EventHandler,
    options?: SubscribeOptions
  ): Promise<void> {
    const channel = this.channel;

    if (!channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    await channel.assertQueue(queueName, { durable: true });

    if (options) {
      await channel.assertExchange(options.exchangeName, options.exchangeType ?? 'topic', {
        durable: true,
      });
      await channel.bindQueue(queueName, options.exchangeName, options.routingKey);
      console.log(
        `[EventBus] Bound queue ${queueName} to ${options.exchangeName} with ${options.routingKey}`
      );
    }

    await channel.consume(
      queueName,
      async (message) => {
        if (!message) {
          return;
        }

        try {
          await handler(message, {
            ack: () => channel.ack(message),
            nack: (requeue = false) => channel.nack(message, false, requeue),
          });
        } catch (error) {
          console.log(`[EventBus] Handler failed for queue ${queueName}:`, error);
          channel.nack(message, false, false);
        }
      },
      { noAck: false }
    );

    console.log(`[EventBus] Subscribed to queue ${queueName}`);
  }

  /** Подписывается на очередь с ручным подтверждением сообщений. */
  async subscribe(
    queueName: string,
    handler: EventHandler,
    options?: SubscribeOptions
  ): Promise<void> {
    const alreadyRegistered = this.subscriptions.some((sub) => sub.queueName === queueName);

    if (!alreadyRegistered) {
      this.subscriptions.push({ queueName, handler, options });
    }

    if (!this.channel) {
      await this.connect();
    }

    await this.attachConsumer(queueName, handler, options);
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
