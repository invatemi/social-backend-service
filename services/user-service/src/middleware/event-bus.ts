import * as amqp from 'amqplib';
import type { Channel, ConsumeMessage } from 'amqplib';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

const USER_EVENTS_EXCHANGE = 'user.events';

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

export class EventBus {
  private static instance: EventBus;

  private connection: AmqpConnection | null = null;
  private channel: Channel | null = null;

  private constructor() {}

  /** Returns the singleton event bus instance. */
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }

    return EventBus.instance;
  }

  /** Opens a RabbitMQ connection and asserts the user exchange. */
  async connect(): Promise<void> {
    if (this.channel) {
      return;
    }

    const rabbitMqUrl = process.env.RABBITMQ_URL;

    if (!rabbitMqUrl) {
      throw new Error('RABBITMQ_URL is not configured');
    }

    try {
      this.connection = await amqp.connect(rabbitMqUrl);

      this.connection.on('error', (error) => {
        console.log('[EventBus] Connection error:', error);
      });

      this.connection.on('close', () => {
        console.log('[EventBus] Connection closed');
        this.connection = null;
        this.channel = null;
      });

      this.channel = await this.connection.createChannel();
      await this.channel.prefetch(10);

      this.channel.on('error', (error) => {
        console.log('[EventBus] Channel error:', error);
      });

      await this.channel.assertExchange(USER_EVENTS_EXCHANGE, 'topic', {
        durable: true,
      });

      console.log('[EventBus] Connected to RabbitMQ');
    } catch (error) {
      this.connection = null;
      this.channel = null;
      console.log('[EventBus] Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  /** Publishes a durable user-domain event. */
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

    const isPublished = channel.publish(
      USER_EVENTS_EXCHANGE,
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

  /** Subscribes to a durable queue with manual acknowledgements. */
  async subscribe(
    queueName: string,
    handler: EventHandler,
    options?: SubscribeOptions
  ): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

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

  /** Closes the RabbitMQ channel and connection. */
  async disconnect(): Promise<void> {
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
