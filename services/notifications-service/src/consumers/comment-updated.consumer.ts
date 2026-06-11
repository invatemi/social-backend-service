import { z } from 'zod';
import { getConfig } from '../config/env';
import { eventBus } from '../middleware/event-bus';

const commentUpdatedEventSchema = z.object({
  commentId: z.number().int().positive(),
  postId: z.number().int().positive(),
  userId: z.number().int().positive(),
  content: z.string().min(1),
  timestamp: z.string().datetime(),
});

/** Registers the comment.updated notification consumer. */
export const registerCommentUpdatedConsumer = async (): Promise<void> => {
  const { queues, postEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.commentUpdated,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        commentUpdatedEventSchema.parse(payload);
        ack();
      } catch (error) {
        console.log('[Consumer:comment.updated] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: postEventsExchange,
      routingKey: 'comment.updated',
    }
  );
};
