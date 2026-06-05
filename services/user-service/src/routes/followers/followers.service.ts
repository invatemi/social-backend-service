import { PrismaClient } from '../../generated/prisma/client';
import {
  ValidationError,
  UserNotFoundError,
  SelfFollowError,
  AlreadyFollowingError,
  NotFollowingError,
} from './followers.errors';

export interface FollowerData {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  followedAt: Date;
}

export interface FollowersResponse {
  user: { id: number; name: string };
  followers: FollowerData[];
  total: number;
}

export interface FollowingResponse {
  user: { id: number; name: string };
  following: FollowerData[];
  total: number;
}

const validateUserId = (userId: unknown): number => {
  const id = Number(userId);
  if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid user ID', 'userId');
  }
  return id;
};

export class FollowersService {
  constructor(private prisma: PrismaClient) {}

  // Получить подписчиков пользователя
  async getFollowers(userId: number): Promise<FollowersResponse> {
    const id = validateUserId(userId);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const follows = await this.prisma.follow.findMany({
      where: { followingId: id },
      select: {
        follower: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const followers: FollowerData[] = follows.map((f) => ({
      id: f.follower.id,
      name: f.follower.name,
      email: f.follower.email,
      avatarUrl: f.follower.avatarUrl,
      followedAt: f.createdAt,
    }));

    return { user, followers, total: followers.length };
  }

  // Получить подписки пользователя
  async getFollowing(userId: number): Promise<FollowingResponse> {
    const id = validateUserId(userId);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const follows = await this.prisma.follow.findMany({
      where: { followerId: id },
      select: {
        following: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const following: FollowerData[] = follows.map((f) => ({
      id: f.following.id,
      name: f.following.name,
      email: f.following.email,
      avatarUrl: f.following.avatarUrl,
      followedAt: f.createdAt,
    }));

    return { user, following, total: following.length };
  }

  // Подписаться
  async followUser(followerId: number, followingId: number): Promise<void> {
    const fid = validateUserId(followerId);
    const gid = validateUserId(followingId);

    if (fid === gid) throw new SelfFollowError();

    const [follower, following] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: fid }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: gid }, select: { id: true } }),
    ]);
    if (!follower) throw new UserNotFoundError(fid);
    if (!following) throw new UserNotFoundError(gid);

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: fid, followingId: gid } },
    });
    if (existing) throw new AlreadyFollowingError();

    await this.prisma.follow.create({
      data: { followerId: fid, followingId: gid },
    });
  }

  // Отписаться
  async unfollowUser(followerId: number, followingId: number): Promise<void> {
    const fid = validateUserId(followerId);
    const gid = validateUserId(followingId);

    if (fid === gid) throw new SelfFollowError();

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: fid, followingId: gid } },
    });
    if (!existing) throw new NotFollowingError();

    await this.prisma.follow.delete({
      where: { followerId_followingId: { followerId: fid, followingId: gid } },
    });
  }

  // Проверить подписку
  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    const fid = validateUserId(followerId);
    const gid = validateUserId(followingId);

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: fid, followingId: gid } },
    });
    return !!existing;
  }

  // Количество подписчиков и подписок
  async getCounts(userId: number) {
    const id = validateUserId(userId);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const [followersCount, followingCount] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: id } }),
      this.prisma.follow.count({ where: { followerId: id } }),
    ]);

    return { followersCount, followingCount };
  }
}