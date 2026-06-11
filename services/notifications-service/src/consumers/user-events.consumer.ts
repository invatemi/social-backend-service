import { z } from 'zod';
import { PrismaClient } from '../generated/prisma/client';
import { getConfig } from '../config/env';
import { eventBus } from '../middleware/event-bus';
import { NotificationsService } from '../routes/notifications/notifications.service';
import { mapFriendStatusToSseEvent } from '../routes/notifications/sse-event-mapper';
import { publishSocketEvent } from '../routes/notifications/socket-hub';

const userSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  avatarUrl: z.string().nullable().optional(),
});

const friendRequestedSchema = z.object({
  requestId: z.number().int().positive(),
  fromUser: userSummarySchema,
  toUser: userSummarySchema,
  timestamp: z.string().datetime(),
});

const friendStatusSchema = z.object({
  requestId: z.number().int().positive(),
  fromUser: userSummarySchema,
  toUser: userSummarySchema,
  timestamp: z.string().datetime(),
});

const friendAcceptedSchema = z.object({
  requestId: z.number().int().positive(),
  friendshipId: z.number().int().positive(),
  fromUser: userSummarySchema,
  toUser: userSummarySchema,
  timestamp: z.string().datetime(),
});

const friendRemovedSchema = z.object({
  initiatorUser: userSummarySchema,
  targetUser: userSummarySchema,
  movedToFollowing: z.boolean(),
  timestamp: z.string().datetime(),
});

const followSchema = z.object({
  followerUser: userSummarySchema,
  followingUser: userSummarySchema,
  timestamp: z.string().datetime(),
});

const userUpdatedSchema = z.object({
  userId: z.number().int().positive(),
  changedFields: z.array(z.string().min(1)),
  user: userSummarySchema.extend({
    bio: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
  }),
  timestamp: z.string().datetime(),
});

const parseMessage = <T>(schema: z.ZodType<T>, content: Buffer): T => {
  const payload = JSON.parse(content.toString('utf8')) as unknown;

  return schema.parse(payload);
};

/** Registers all user-domain notification consumers. */
export const registerUserEventConsumers = async (
  prisma: PrismaClient
): Promise<void> => {
  const { queues, userEventsExchange } = getConfig();
  const notificationsService = new NotificationsService(prisma);

  await eventBus.subscribe(
    queues.friendRequested,
    async (message, { ack, nack }) => {
      try {
        const event = parseMessage(friendRequestedSchema, message.content);

        await notificationsService.createNotification({
          recipientUserId: event.toUser.id,
          actorUserId: event.fromUser.id,
          type: 'FRIEND_REQUESTED',
          title: 'New friend request',
          body: `${event.fromUser.name} sent you a friend request`,
          payload: event,
        });

        ack();
      } catch (error) {
        console.log('[Consumer:friend.requested] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: userEventsExchange,
      routingKey: 'friend.requested',
    }
  );

  await eventBus.subscribe(
    queues.friendAccepted,
    async (message, { ack, nack }) => {
      try {
        const event = parseMessage(friendAcceptedSchema, message.content);

        await notificationsService.createNotification({
          recipientUserId: event.fromUser.id,
          actorUserId: event.toUser.id,
          type: 'FRIEND_ACCEPTED',
          title: 'Friend request accepted',
          body: `${event.toUser.name} accepted your friend request`,
          payload: event,
        });

        ack();
      } catch (error) {
        console.log('[Consumer:friend.accepted] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: userEventsExchange,
      routingKey: 'friend.accepted',
    }
  );

  await eventBus.subscribe(
    queues.friendRemoved,
    async (message, { ack, nack }) => {
      try {
        const event = parseMessage(friendRemovedSchema, message.content);

        await notificationsService.createNotification({
          recipientUserId: event.targetUser.id,
          actorUserId: event.initiatorUser.id,
          type: 'FRIEND_REMOVED',
          title: 'Friend removed',
          body: `${event.initiatorUser.name} removed you from friends`,
          payload: event,
        });

        ack();
      } catch (error) {
        console.log('[Consumer:friend.removed] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: userEventsExchange,
      routingKey: 'friend.removed',
    }
  );

  await eventBus.subscribe(
    queues.friendCancelled,
    async (message, { ack, nack }) => {
      try {
        const event = parseMessage(friendStatusSchema, message.content);

        const sseEvent = mapFriendStatusToSseEvent('friend_request_cancelled', {
          requestId: event.requestId,
          fromUser: event.fromUser,
          toUser: event.toUser,
        });
        publishSocketEvent(event.toUser.id, sseEvent.event, sseEvent.data);

        ack();
      } catch (error) {
        console.log('[Consumer:friend.cancelled] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: userEventsExchange,
      routingKey: 'friend.cancelled',
    }
  );

  await eventBus.subscribe(
    queues.friendDeclined,
    async (message, { ack, nack }) => {
      try {
        const event = parseMessage(friendStatusSchema, message.content);

        const sseEvent = mapFriendStatusToSseEvent('friend_declined', {
          requestId: event.requestId,
          fromUser: event.fromUser,
          toUser: event.toUser,
        });
        publishSocketEvent(event.fromUser.id, sseEvent.event, sseEvent.data);

        ack();
      } catch (error) {
        console.log('[Consumer:friend.declined] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: userEventsExchange,
      routingKey: 'friend.declined',
    }
  );

  await eventBus.subscribe(
    queues.followCreated,
    async (message, { ack, nack }) => {
      try {
        const event = parseMessage(followSchema, message.content);

        await notificationsService.createNotification({
          recipientUserId: event.followingUser.id,
          actorUserId: event.followerUser.id,
          type: 'FOLLOW_CREATED',
          title: 'New follower',
          body: `${event.followerUser.name} started following you`,
          payload: event,
        });

        ack();
      } catch (error) {
        console.log('[Consumer:follow.created] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: userEventsExchange,
      routingKey: 'follow.created',
    }
  );

  await eventBus.subscribe(
    queues.followDeleted,
    async (message, { ack, nack }) => {
      try {
        const event = parseMessage(followSchema, message.content);

        await notificationsService.createNotification({
          recipientUserId: event.followingUser.id,
          actorUserId: event.followerUser.id,
          type: 'FOLLOW_DELETED',
          title: 'Follower removed',
          body: `${event.followerUser.name} stopped following you`,
          payload: event,
        });

        ack();
      } catch (error) {
        console.log('[Consumer:follow.deleted] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: userEventsExchange,
      routingKey: 'follow.deleted',
    }
  );

  await eventBus.subscribe(
    queues.userUpdated,
    async (message, { ack, nack }) => {
      try {
        const event = parseMessage(userUpdatedSchema, message.content);

        await notificationsService.createNotification({
          recipientUserId: event.userId,
          actorUserId: event.userId,
          type: 'USER_UPDATED',
          title: 'Profile updated',
          body: `Profile fields updated: ${event.changedFields.join(', ')}`,
          payload: event,
        });

        ack();
      } catch (error) {
        console.log('[Consumer:user.updated] Failed to process message:', error);
        nack(false);
      }
    },
    {
      exchangeName: userEventsExchange,
      routingKey: 'user.updated',
    }
  );
};
