import { PrismaClient } from '../../generated/prisma/client';
import {
  ValidationError,
  UserNotFoundError,
  SelfFriendError,
  NotFriendsError,
} from './friends.errors';

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

const validateUserId = (userId: unknown): number => {
  const id = Number(userId);
  if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid user ID', 'userId');
  }
  return id;
};

export class FriendsService {
  constructor(private prisma: PrismaClient) {}

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
      this.prisma.user.findUnique({ where: { id: initId }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: targId }, select: { id: true } }),
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