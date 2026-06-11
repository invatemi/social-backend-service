import { z } from 'zod';
import { PrismaClient } from '../generated/prisma';
import { getConfig } from '../config/env';
import { eventBus } from '../middleware/event-bus';
import {
  EmailConflictError,
  UserProvisioningService,
} from '../routes/profile/user-provisioning.service';

const userRegisteredSchema = z.object({
  userId: z.number().int().positive(),
  username: z.string().min(1),
  email: z.string().email(),
  roleId: z.number().int().positive(),
  timestamp: z.string().datetime(),
});

const parseMessage = (content: Buffer) => {
  const payload = JSON.parse(content.toString('utf8')) as unknown;
  return userRegisteredSchema.parse(payload);
};

/** Registers the user.registered consumer. */
export const registerUserRegisteredConsumer = async (
  prisma: PrismaClient
): Promise<void> => {
  const { userRegisteredQueue, userEventsExchange, userRegisteredRoutingKey } = getConfig();
  const provisioningService = new UserProvisioningService(prisma);

  await eventBus.subscribe(
    userRegisteredQueue,
    async (message, { ack, nack }) => {
      try {
        const event = parseMessage(message.content);

        await provisioningService.provisionFromRegistration({
          userId: event.userId,
          username: event.username,
          email: event.email,
          roleId: event.roleId,
        });

        ack();
      } catch (error) {
        if (error instanceof EmailConflictError) {
          console.error('[Consumer:user.registered] Data conflict:', error.message);
        } else {
          console.log('[Consumer:user.registered] Failed to process message:', error);
        }

        nack(false);
      }
    },
    {
      exchangeName: userEventsExchange,
      routingKey: userRegisteredRoutingKey,
    }
  );
};
