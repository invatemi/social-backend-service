import * as amqp from 'amqplib';
import type { Channel, ConsumeMessage } from 'amqplib';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

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
      await this.channel.prefetch(10);

      this.channel.on('error', (error) => {
        console.log('[EventBus] Channel error:', error);
      });

      console.log('[EventBus] Connected to RabbitMQ');
    } catch (error) {
      this.connection = null;
      this.channel = null;
      console.log('[EventBus] Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

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
