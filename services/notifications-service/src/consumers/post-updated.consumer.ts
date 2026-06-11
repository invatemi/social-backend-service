import { z } from 'zod';
import { getConfig } from '../config/env';
import { eventBus } from '../middleware/event-bus';
import { dispatchPostFeedEvent } from './post-socket.dispatcher';

const postUpdatedEventSchema = z.object({
  postId: z.number().int().positive(),
  userId: z.number().int().positive(),
  title: z.string().nullable(),
  content: z.string(),
  imageUrl: z.string().nullable(),
  isPublished: z.boolean(),
  likesCount: z.number().int().min(0).default(0),
  commentsCount: z.number().int().min(0).default(0),
  timestamp: z.string().datetime(),
});

/** Registers the post.updated notification consumer. */
export const registerPostUpdatedConsumer = async (): Promise<void> => {
  const { queues, postEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.postUpdated,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = postUpdatedEventSchema.parse(payload);

        if (event.isPublished) {
          await dispatchPostFeedEvent('post:updated', event);
        }

        ack();
      } catch (error) {
        console.log('[Consumer:post.updated] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: postEventsExchange,
      routingKey: 'post.updated',
    }
  );
};
