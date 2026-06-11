import { z } from 'zod';
import { getConfig } from '../config/env';
import { eventBus } from '../middleware/event-bus';
import { dispatchPostLikedEvent } from './post-socket.dispatcher';

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
  const { queues, postEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.postLiked,
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
      exchangeName: postEventsExchange,
      routingKey: 'post.liked',
    }
  );
};
