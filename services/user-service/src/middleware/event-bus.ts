import * as amqp from 'amqplib';
import type { Channel } from 'amqplib';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

const USER_EVENTS_EXCHANGE = 'user.events';

export type UserEventRoutingKey =
  | 'friend.requested'
  | 'friend.accepted'
  | 'friend.removed'
  | 'follow.created'
  | 'follow.deleted'
  | 'user.updated';

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

export type UserEventPayload =
  | FriendRequestedPayload
  | FriendAcceptedPayload
  | FriendRemovedPayload
  | FollowPayload
  | UserUpdatedPayload;

export class EventBus {
  private static instance: EventBus;

  private connection: AmqpConnection | null = null;
  private channel: Channel | null = null;

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }

    return EventBus.instance;
  }

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
