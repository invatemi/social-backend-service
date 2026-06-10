import { z } from 'zod';
import { eventBus } from '../middleware/event-bus';
import { dispatchPostLikedEvent } from './post-socket.dispatcher';

const QUEUE_NAME = 'notifications.post.liked';

const postLikedEventSchema = z.object({
  postId: z.number().int().positive(),
  userId: z.number().int().positive(),
  postAuthorId: z.number().int().positive(),
  liked: z.boolean(),
  likesCount: z.number().int().min(0),
  timestamp: z.string().datetime(),
});

/** Registers the post.liked notification consumer. */
export const registerPostLikedConsumer = async (): Promise<void> => {
  await eventBus.subscribe(
    QUEUE_NAME,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = postLikedEventSchema.parse(payload);

        await dispatchPostLikedEvent(event);
        ack();
      } catch (error) {
        console.log('[Consumer:post.liked] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: 'post.events',
      routingKey: 'post.liked',
    }
  );
};
