import * as amqp from 'amqplib';
import type { Channel } from 'amqplib';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

const POST_EVENTS_EXCHANGE = 'post.events';

export type CommentEventRoutingKey =
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted';

export type PostEventRoutingKey =
  | 'post.created'
  | 'post.updated'
  | 'post.deleted';

export type EventRoutingKey = CommentEventRoutingKey | PostEventRoutingKey;

export interface CommentEventPayload {
  commentId: number;
  postId: number;
  userId: number;
  content?: string;
  timestamp: string;
}

export interface PostEventPayload {
  postId: number;
  userId: number;
  title: string | null;
  content: string;
  imageUrl: string | null;
  isPublished: boolean;
  timestamp: string;
}

export type EventPayload = CommentEventPayload | PostEventPayload;

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

  /** Opens a RabbitMQ connection and asserts the post exchange. */
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

      await this.channel.assertExchange(POST_EVENTS_EXCHANGE, 'topic', {
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

  /** Publishes a durable post-domain event. */
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

    const isPublished = channel.publish(
      POST_EVENTS_EXCHANGE,
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
