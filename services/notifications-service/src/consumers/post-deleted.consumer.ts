import { z } from 'zod';
import { getConfig } from '../config/env';
import { eventBus } from '../middleware/event-bus';
import { dispatchPostFeedEvent } from './post-socket.dispatcher';

const postDeletedEventSchema = z.object({
  postId: z.number().int().positive(),
  userId: z.number().int().positive(),
  title: z.string().nullable(),
  content: z.string().min(1),
  imageUrl: z.string().nullable(),
  isPublished: z.boolean(),
  timestamp: z.string().datetime(),
});

/** Registers the post.deleted notification consumer. */
export const registerPostDeletedConsumer = async (): Promise<void> => {
  const { queues, postEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.postDeleted,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = postDeletedEventSchema.parse(payload);

        await dispatchPostFeedEvent('post:deleted', event);
        ack();
      } catch (error) {
        console.log('[Consumer:post.deleted] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: postEventsExchange,
      routingKey: 'post.deleted',
    }
  );
};
