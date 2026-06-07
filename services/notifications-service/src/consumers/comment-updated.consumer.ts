import { z } from 'zod';
import { eventBus } from '../middleware/event-bus';

const QUEUE_NAME = 'notifications.comment.updated';

const commentUpdatedEventSchema = z.object({
  commentId: z.number().int().positive(),
  postId: z.number().int().positive(),
  userId: z.number().int().positive(),
  content: z.string().min(1),
  timestamp: z.string().datetime(),
});

/** Registers the comment.updated notification consumer. */
export const registerCommentUpdatedConsumer = async (): Promise<void> => {
  await eventBus.subscribe(
    QUEUE_NAME,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = commentUpdatedEventSchema.parse(payload);

        console.log('[Consumer:comment.updated] Received:', event);
        ack();
      } catch (error) {
        console.log('[Consumer:comment.updated] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: 'post.events',
      routingKey: 'comment.updated',
    }
  );
};
