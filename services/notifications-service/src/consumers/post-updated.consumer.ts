import { z } from 'zod';
import { eventBus } from '../middleware/event-bus';

const QUEUE_NAME = 'notifications.post.updated';

const postUpdatedEventSchema = z.object({
  postId: z.number().int().positive(),
  userId: z.number().int().positive(),
  title: z.string().nullable(),
  content: z.string().min(1),
  imageUrl: z.string().nullable(),
  isPublished: z.boolean(),
  timestamp: z.string().datetime(),
});

/** Registers the post.updated notification consumer. */
export const registerPostUpdatedConsumer = async (): Promise<void> => {
  await eventBus.subscribe(
    QUEUE_NAME,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = postUpdatedEventSchema.parse(payload);

        console.log('[Consumer:post.updated] Received:', event);
        ack();
      } catch (error) {
        console.log('[Consumer:post.updated] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: 'post.events',
      routingKey: 'post.updated',
    }
  );
};
