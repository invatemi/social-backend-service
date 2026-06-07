import { PrismaClient } from '../../generated/prisma/client';
import {
  ValidationError,
  UserNotFoundError,
  SelfFriendError,
  NotFriendsError,
  AlreadyFriendsError,
  FriendRequestAlreadyExistsError,
  FriendRequestNotFoundError,
} from './friends.errors';
import { eventBus, UserSummary } from '../../middleware/event-bus';
import { cache } from '../../middleware/redis';
import {
  invalidateFollowCaches,
  invalidateFriendCaches,
  USER_LIST_CACHE_TTL_SECONDS,
  userCacheKeys,
} from '../../middleware/user-cache';

export interface FriendData {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  friendsSince: Date;
}

export interface FriendsResponse {
  user: { id: number; name: string };
  friends: FriendData[];
  total: number;
}

export interface FriendRequestData {
  id: number;
  fromUser: UserSummary;
  toUser: UserSummary;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const validateUserId = (userId: unknown): number => {
  const id = Number(userId);
  if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid user ID', 'userId');
  }
  return id;
};

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} as const;

const formatFriendRequest = (request: {
  id: number;
  from: UserSummary;
  to: UserSummary;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): FriendRequestData => ({
  id: request.id,
  fromUser: request.from,
  toUser: request.to,
  status: request.status,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

const publishFriendEvent = async (
  routingKey: 'friend.requested' | 'friend.accepted' | 'friend.removed',
  payload: Parameters<typeof eventBus.publish>[1]
): Promise<void> => {
  try {
    await eventBus.publish(routingKey, payload);
  } catch (error) {
    console.log(`[EventBus] Failed to publish ${routingKey}:`, error);
  }
};

export class FriendsService {
  constructor(private prisma: PrismaClient) {}

  /** Sends a friend request and follows the target user. */
  async sendFriendRequest(
    fromUserId: number,
    toUserId: number
  ): Promise<{ request: FriendRequestData; movedToFollowing: boolean }> {
    const fromId = validateUserId(fromUserId);
    const toId = validateUserId(toUserId);

    if (fromId === toId) throw new SelfFriendError();

    const [fromUser, toUser] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: fromId }, select: userSummarySelect }),
      this.prisma.user.findUnique({ where: { id: toId }, select: userSummarySelect }),
    ]);
    if (!fromUser) throw new UserNotFoundError(fromId);
    if (!toUser) throw new UserNotFoundError(toId);

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: fromId, friendId: toId },
          { userId: toId, friendId: fromId },
        ],
      },
    });
    if (friendship) throw new AlreadyFriendsError();

    const existingRequest = await this.prisma.friendRequest.findFirst({
      where: { fromUserId: fromId, toUserId: toId },
    });

    if (existingRequest?.status === 'pending') {
      throw new FriendRequestAlreadyExistsError();
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const nextRequest = existingRequest
        ? await tx.friendRequest.update({
            where: { id: existingRequest.id },
            data: { status: 'pending', updatedAt: new Date() },
            include: {
              from: { select: userSummarySelect },
              to: { select: userSummarySelect },
            },
          })
        : await tx.friendRequest.create({
            data: { fromUserId: fromId, toUserId: toId },
            include: {
              from: { select: userSummarySelect },
              to: { select: userSummarySelect },
            },
          });

      await tx.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: fromId,
            followingId: toId,
          },
        },
        update: {},
        create: {
          followerId: fromId,
          followingId: toId,
        },
      });

      return nextRequest;
    });

    await publishFriendEvent('friend.requested', {
      requestId: request.id,
      fromUser,
      toUser,
      timestamp: new Date().toISOString(),
    });
    await Promise.all([
      invalidateFollowCaches(fromId, toId),
      invalidateFriendCaches(fromId, toId),
    ]);

    return {
      request: formatFriendRequest(request),
      movedToFollowing: true,
    };
  }

  /** Accepts a pending friend request and creates a friendship. */
  async acceptFriendRequest(
    receiverId: number,
    requestId: number
  ): Promise<{ request: FriendRequestData; friendshipId: number }> {
    const userId = validateUserId(receiverId);
    const friendRequestId = validateUserId(requestId);

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.friendRequest.findFirst({
        where: {
          id: friendRequestId,
          toUserId: userId,
          status: 'pending',
        },
        include: {
          from: { select: userSummarySelect },
          to: { select: userSummarySelect },
        },
      });

      if (!request) {
        throw new FriendRequestNotFoundError();
      }

      const existingFriendship = await tx.friendship.findFirst({
        where: {
          OR: [
            { userId: request.fromUserId, friendId: request.toUserId },
            { userId: request.toUserId, friendId: request.fromUserId },
          ],
        },
      });

      const friendship =
        existingFriendship ??
        (await tx.friendship.create({
          data: {
            userId: request.fromUserId,
            friendId: request.toUserId,
          },
        }));

      const updatedRequest = await tx.friendRequest.update({
        where: { id: request.id },
        data: { status: 'accepted', updatedAt: new Date() },
        include: {
          from: { select: userSummarySelect },
          to: { select: userSummarySelect },
        },
      });

      await tx.friendRequest.deleteMany({
        where: {
          OR: [
            {
              fromUserId: request.toUserId,
              toUserId: request.fromUserId,
              status: 'pending',
            },
            {
              fromUserId: request.fromUserId,
              toUserId: request.toUserId,
              status: 'pending',
            },
          ],
          NOT: { id: request.id },
        },
      });

      await tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: request.fromUserId, followingId: request.toUserId },
            { followerId: request.toUserId, followingId: request.fromUserId },
          ],
        },
      });

      return { request: updatedRequest, friendship };
    });

    await publishFriendEvent('friend.accepted', {
      requestId: result.request.id,
      friendshipId: result.friendship.id,
      fromUser: result.request.from,
      toUser: result.request.to,
      timestamp: new Date().toISOString(),
    });
    await Promise.all([
      invalidateFollowCaches(result.request.fromUserId, result.request.toUserId),
      invalidateFollowCaches(result.request.toUserId, result.request.fromUserId),
      invalidateFriendCaches(result.request.fromUserId, result.request.toUserId),
    ]);

    return {
      request: formatFriendRequest(result.request),
      friendshipId: result.friendship.id,
    };
  }

  /** Returns incoming pending friend requests. */
  async getIncomingRequests(userId: number): Promise<{ requests: FriendRequestData[]; total: number }> {
    const id = validateUserId(userId);
    const cacheKey = userCacheKeys.incomingRequests(id);
    const cached = await cache.get<{ requests: FriendRequestData[]; total: number }>(cacheKey);
    if (cached) {
      return cached;
    }

    const requests = await this.prisma.friendRequest.findMany({
      where: { toUserId: id, status: 'pending' },
      include: {
        from: { select: userSummarySelect },
        to: { select: userSummarySelect },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = {
      requests: requests.map(formatFriendRequest),
      total: requests.length,
    };

    await cache.set(cacheKey, result, USER_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  /** Returns outgoing pending friend requests. */
  async getOutgoingRequests(userId: number): Promise<{ requests: FriendRequestData[]; total: number }> {
    const id = validateUserId(userId);
    const cacheKey = userCacheKeys.outgoingRequests(id);
    const cached = await cache.get<{ requests: FriendRequestData[]; total: number }>(cacheKey);
    if (cached) {
      return cached;
    }

    const requests = await this.prisma.friendRequest.findMany({
      where: { fromUserId: id, status: 'pending' },
      include: {
        from: { select: userSummarySelect },
        to: { select: userSummarySelect },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = {
      requests: requests.map(formatFriendRequest),
      total: requests.length,
    };

    await cache.set(cacheKey, result, USER_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  /** Returns friends for a user. */
  async getFriends(userId: number): Promise<FriendsResponse> {
    const id = validateUserId(userId);
    const cacheKey = userCacheKeys.friends(id);
    const cached = await cache.get<FriendsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ userId: id }, { friendId: id }],
      },
      select: {
        userId: true,
        friendId: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        friend: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const friends: FriendData[] = friendships.map((f) => {
      const friendUser = f.userId === id ? f.friend : f.user;
      return {
        id: friendUser.id,
        name: friendUser.name,
        email: friendUser.email,
        avatarUrl: friendUser.avatarUrl,
        friendsSince: f.createdAt,
      };
    });

    const result = { user, friends, total: friends.length };
    await cache.set(cacheKey, result, USER_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  /** Removes a friendship and follows the removed user. */
  async removeFriend(
    initiatorId: number,
    targetId: number
  ): Promise<{ movedToFollowing: boolean }> {
    const initId = validateUserId(initiatorId);
    const targId = validateUserId(targetId);

    if (initId === targId) throw new SelfFriendError();

    const [initiator, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: initId }, select: userSummarySelect }),
      this.prisma.user.findUnique({ where: { id: targId }, select: userSummarySelect }),
    ]);
    if (!initiator) throw new UserNotFoundError(initId);
    if (!target) throw new UserNotFoundError(targId);

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: initId, friendId: targId },
          { userId: targId, friendId: initId },
        ],
      },
    });

    if (!friendship) throw new NotFriendsError();

    await this.prisma.$transaction([
      this.prisma.friendship.delete({
        where: { id: friendship.id },
      }),
      this.prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: initId,
            followingId: targId,
          },
        },
        update: {},
        create: {
          followerId: initId,
          followingId: targId,
        },
      }),
    ]);

    await Promise.all([
      invalidateFriendCaches(initId, targId),
      invalidateFollowCaches(initId, targId),
    ]);
    await publishFriendEvent('friend.removed', {
      initiatorUser: initiator,
      targetUser: target,
      movedToFollowing: true,
      timestamp: new Date().toISOString(),
    });

    return { movedToFollowing: true };
  }

  /** Checks whether two users are friends. */
  async areFriends(userId1: number, userId2: number): Promise<boolean> {
    const id1 = validateUserId(userId1);
    const id2 = validateUserId(userId2);
    const cacheKey = userCacheKeys.friendship(id1, id2);
    const cached = await cache.get<boolean>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: id1, friendId: id2 },
          { userId: id2, friendId: id1 },
        ],
      },
    });

    const result = !!friendship;
    await cache.set(cacheKey, result, USER_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  /** Returns friend count for a user. */
  async getFriendsCount(userId: number): Promise<{ friendsCount: number }> {
    const id = validateUserId(userId);
    const cacheKey = userCacheKeys.friendsCount(id);
    const cached = await cache.get<{ friendsCount: number }>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const friendsCount = await this.prisma.friendship.count({
      where: {
        OR: [{ userId: id }, { friendId: id }],
      },
    });

    const result = { friendsCount };
    await cache.set(cacheKey, result, USER_LIST_CACHE_TTL_SECONDS);
    return result;
  }
}