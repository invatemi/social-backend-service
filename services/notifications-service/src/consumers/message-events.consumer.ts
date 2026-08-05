import { z } from 'zod';
import { getConfig } from '../config/env';
import { eventBus } from '../middleware/event-bus';
import { publishSocketEventToMany } from '../routes/notifications/socket-hub';

const messageAuthorSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  avatarUrl: z.string().nullable(),
});

const messageCreatedSchema = z.object({
  id: z.number().int().positive(),
  chatId: z.number().int().positive(),
  content: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable().optional(),
  forwardedFromId: z.number().int().positive().nullable().optional(),
  isRead: z.boolean().optional(),
  author: messageAuthorSchema,
  attachments: z.array(z.unknown()).optional(),
  participantIds: z.array(z.number().int().positive()),
  timestamp: z.string(),
});

const messageUpdatedSchema = z.object({
  id: z.number().int().positive(),
  chatId: z.number().int().positive(),
  content: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable().optional(),
  forwardedFromId: z.number().int().positive().nullable().optional(),
  isRead: z.boolean().optional(),
  author: messageAuthorSchema,
  attachments: z.array(z.unknown()).optional(),
  participantIds: z.array(z.number().int().positive()),
  timestamp: z.string(),
});

const messageDeletedSchema = z.object({
  id: z.number().int().positive(),
  chatId: z.number().int().positive(),
  participantIds: z.array(z.number().int().positive()),
  timestamp: z.string(),
});

const chatCreatedSchema = z.object({
  chatId: z.number().int().positive(),
  participantIds: z.array(z.number().int().positive()),
  chatName: z.string().nullable().optional(),
  isGroup: z.boolean().optional(),
  timestamp: z.string(),
});

const chatDeletedSchema = z.object({
  chatId: z.number().int().positive(),
  participantIds: z.array(z.number().int().positive()),
  timestamp: z.string(),
});

const chatReadSchema = z.object({
  chatId: z.number().int().positive(),
  readerId: z.number().int().positive(),
  lastReadAt: z.string(),
  participantIds: z.array(z.number().int().positive()),
  timestamp: z.string(),
});

/** Registers message.created socket dispatcher. */
export const registerMessageCreatedConsumer = async (): Promise<void> => {
  const { queues, messageEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.messageCreated,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = messageCreatedSchema.parse(payload);

        const { participantIds, ...socketPayload } = event;
        publishSocketEventToMany(participantIds, 'message:new', socketPayload);
        ack();
      } catch (error) {
        console.log('[Consumer:message.created] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: messageEventsExchange,
      routingKey: 'message.created',
    }
  );
};

/** Registers message.updated socket dispatcher. */
export const registerMessageUpdatedConsumer = async (): Promise<void> => {
  const { queues, messageEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.messageUpdated,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = messageUpdatedSchema.parse(payload);

        const { participantIds, ...socketPayload } = event;
        publishSocketEventToMany(participantIds, 'message:updated', socketPayload);
        ack();
      } catch (error) {
        console.log('[Consumer:message.updated] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: messageEventsExchange,
      routingKey: 'message.updated',
    }
  );
};

/** Registers message.deleted socket dispatcher. */
export const registerMessageDeletedConsumer = async (): Promise<void> => {
  const { queues, messageEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.messageDeleted,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = messageDeletedSchema.parse(payload);

        publishSocketEventToMany(event.participantIds, 'message:deleted', {
          id: event.id,
          chatId: event.chatId,
        });
        ack();
      } catch (error) {
        console.log('[Consumer:message.deleted] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: messageEventsExchange,
      routingKey: 'message.deleted',
    }
  );
};

/** Registers chat.created socket dispatcher. */
export const registerChatCreatedConsumer = async (): Promise<void> => {
  const { queues, messageEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.chatCreated,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = chatCreatedSchema.parse(payload);

        publishSocketEventToMany(event.participantIds, 'chat:created', {
          chatId: event.chatId,
          participantIds: event.participantIds,
          chatName: event.chatName ?? null,
          isGroup: event.isGroup ?? false,
        });
        ack();
      } catch (error) {
        console.log('[Consumer:chat.created] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: messageEventsExchange,
      routingKey: 'chat.created',
    }
  );
};

/** Registers chat.deleted socket dispatcher. */
export const registerChatDeletedConsumer = async (): Promise<void> => {
  const { queues, messageEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.chatDeleted,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = chatDeletedSchema.parse(payload);

        publishSocketEventToMany(event.participantIds, 'chat:deleted', {
          chatId: event.chatId,
        });
        ack();
      } catch (error) {
        console.log('[Consumer:chat.deleted] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: messageEventsExchange,
      routingKey: 'chat.deleted',
    }
  );
};

/** Registers chat.read socket dispatcher (read receipts). */
export const registerChatReadConsumer = async (): Promise<void> => {
  const { queues, messageEventsExchange } = getConfig();

  await eventBus.subscribe(
    queues.chatRead,
    async (message, { ack, nack }) => {
      try {
        const payload = JSON.parse(message.content.toString('utf8')) as unknown;
        const event = chatReadSchema.parse(payload);

        publishSocketEventToMany(event.participantIds, 'chat:read', {
          chatId: event.chatId,
          readerId: event.readerId,
          lastReadAt: event.lastReadAt,
        });
        ack();
      } catch (error) {
        console.log('[Consumer:chat.read] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: messageEventsExchange,
      routingKey: 'chat.read',
    }
  );
};
