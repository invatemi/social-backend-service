import { z } from 'zod';
import { eventBus } from '../middleware/event-bus';

const QUEUE_NAME = 'notifications.comment.deleted';

const commentDeletedEventSchema = z.object({
  commentId: z.number().int().positive(),
  postId: z.number().int().positive(),
  userId: z.number().int().positive(),
  content: z.string().min(1).optional(),
  timestamp: z.string().datetime(),
});

/** Registers the comment.deleted notification consumer. */
export const registerCommentDeletedConsumer = async (): Promise<void> => {
  await eventBus.subscribe(
    QUEUE_NAME,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = commentDeletedEventSchema.parse(payload);

        console.log('[Consumer:comment.deleted] Received:', event);
        ack();
      } catch (error) {
        console.log('[Consumer:comment.deleted] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: 'post.events',
      routingKey: 'comment.deleted',
    }
  );
};
