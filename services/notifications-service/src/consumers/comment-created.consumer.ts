import { z } from 'zod';
import { getConfig } from '../config/env';
import { eventBus } from '../middleware/event-bus';
import { dispatchCommentEvent } from './post-socket.dispatcher';

const commentCreatedEventSchema = z.object({
  commentId: z.number().int().positive(),
  postId: z.number().int().positive(),
  userId: z.number().int().positive(),
  postAuthorId: z.number().int().positive(),
  content: z.string(),
  commentsCount: z.number().int().min(0),
  timestamp: z.string().datetime(),
});

/** Registers the comment.created notification consumer. */
export const registerCommentCreatedConsumer = async (): Promise<void> => {
  const { queues, postEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.commentCreated,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = commentCreatedEventSchema.parse(payload);

        await dispatchCommentEvent('comment:created', event);
        ack();
      } catch (error) {
        console.log('[Consumer:comment.created] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: postEventsExchange,
      routingKey: 'comment.created',
    }
  );
};
