import { z } from 'zod';
import { eventBus } from '../middleware/event-bus';
import { dispatchPostFeedEvent } from './post-socket.dispatcher';

const QUEUE_NAME = 'notifications.post.created';

const postCreatedEventSchema = z.object({
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

/** Registers the post.created notification consumer. */
export const registerPostCreatedConsumer = async (): Promise<void> => {
  await eventBus.subscribe(
    QUEUE_NAME,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = postCreatedEventSchema.parse(payload);

        if (event.isPublished) {
          await dispatchPostFeedEvent('post:created', event);
        }

        ack();
      } catch (error) {
        console.log('[Consumer:post.created] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: 'post.events',
      routingKey: 'post.created',
    }
  );
};
