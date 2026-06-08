import * as amqp from 'amqplib';
import type { Channel } from 'amqplib';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

const USER_EVENTS_EXCHANGE = 'user.events';

export type UserRegisteredRoutingKey = 'user.registered';

export interface UserRegisteredPayload {
  userId: number;
  username: string;
  email: string;
  roleId: number;
  timestamp: string;
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
    routingKey: UserRegisteredRoutingKey,
    payload: UserRegisteredPayload
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
