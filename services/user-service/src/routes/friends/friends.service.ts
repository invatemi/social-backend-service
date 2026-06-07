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

  // Отправить заявку в друзья и автоматически подписать заявителя
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

    return {
      request: formatFriendRequest(request),
      movedToFollowing: true,
    };
  }

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

    return {
      request: formatFriendRequest(result.request),
      friendshipId: result.friendship.id,
    };
  }

  async getIncomingRequests(userId: number): Promise<{ requests: FriendRequestData[]; total: number }> {
    const id = validateUserId(userId);

    const requests = await this.prisma.friendRequest.findMany({
      where: { toUserId: id, status: 'pending' },
      include: {
        from: { select: userSummarySelect },
        to: { select: userSummarySelect },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      requests: requests.map(formatFriendRequest),
      total: requests.length,
    };
  }

  async getOutgoingRequests(userId: number): Promise<{ requests: FriendRequestData[]; total: number }> {
    const id = validateUserId(userId);

    const requests = await this.prisma.friendRequest.findMany({
      where: { fromUserId: id, status: 'pending' },
      include: {
        from: { select: userSummarySelect },
        to: { select: userSummarySelect },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      requests: requests.map(formatFriendRequest),
      total: requests.length,
    };
  }

  // Получить список друзей пользователя
  async getFriends(userId: number): Promise<FriendsResponse> {
    const id = validateUserId(userId);

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

    return { user, friends, total: friends.length };
  }

  // Удалить из друзей и автоматически перенести в подписчики
  // Логика:
  //   1. Удаляем запись из friendships (дружба взаимная)
  //   2. Создаём запись в followers: initiator → target
  //      (тот, кто удалил, теперь подписан на того, кого удалил)
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

    await publishFriendEvent('friend.removed', {
      initiatorUser: initiator,
      targetUser: target,
      movedToFollowing: true,
      timestamp: new Date().toISOString(),
    });

    return { movedToFollowing: true };
  }

  // Проверить, являются ли пользователи друзьями
  async areFriends(userId1: number, userId2: number): Promise<boolean> {
    const id1 = validateUserId(userId1);
    const id2 = validateUserId(userId2);

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: id1, friendId: id2 },
          { userId: id2, friendId: id1 },
        ],
      },
    });

    return !!friendship;
  }

  // Получить количество друзей пользователя
  async getFriendsCount(userId: number): Promise<{ friendsCount: number }> {
    const id = validateUserId(userId);

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

    return { friendsCount };
  }
}