import { PrismaClient } from '../../generated/prisma';
import {
  ValidationError,
  UserNotFoundError,
  SelfFollowError,
  AlreadyFollowingError,
  NotFollowingError,
} from './followers.errors';
import { eventBus, UserSummary } from '../../middleware/event-bus';
import { cache } from '../../middleware/redis';
import {
  invalidateFollowCaches,
  USER_LIST_CACHE_TTL_SECONDS,
  userCacheKeys,
} from '../../middleware/user-cache';
import { PaginationParams, splitPage } from '../../utils/pagination';

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
  nextCursor: string | null;
}

export interface FollowingResponse {
  user: { id: number; name: string };
  following: FollowerData[];
  total: number;
  nextCursor: string | null;
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

const publishFollowEvent = async (
  routingKey: 'follow.created' | 'follow.deleted',
  followerUser: UserSummary,
  followingUser: UserSummary
): Promise<void> => {
  try {
    await eventBus.publish(routingKey, {
      followerUser,
      followingUser,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.log(`[EventBus] Failed to publish ${routingKey}:`, error);
  }
};

export class FollowersService {
  constructor(private prisma: PrismaClient) {}

  /** Returns followers for a user. */
  async getFollowers(userId: number, pagination: PaginationParams): Promise<FollowersResponse> {
    const id = validateUserId(userId);
    const cacheKey = userCacheKeys.followers(id, pagination);
    const cached = await cache.get<FollowersResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const [follows, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: id },
        select: {
          id: true,
          follower: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          createdAt: true,
        },
        orderBy: { id: 'desc' },
        take: pagination.limit + 1,
        ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      }),
      this.prisma.follow.count({ where: { followingId: id } }),
    ]);

    const page = splitPage(follows, pagination.limit, (follow) => follow.id);

    const followers: FollowerData[] = page.items.map((f) => ({
      id: f.follower.id,
      name: f.follower.name,
      email: f.follower.email,
      avatarUrl: f.follower.avatarUrl,
      followedAt: f.createdAt,
    }));

    const result = { user, followers, total, nextCursor: page.nextCursor };
    await cache.set(cacheKey, result, USER_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  /** Returns users followed by a user. */
  async getFollowing(userId: number, pagination: PaginationParams): Promise<FollowingResponse> {
    const id = validateUserId(userId);
    const cacheKey = userCacheKeys.following(id, pagination);
    const cached = await cache.get<FollowingResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const [follows, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: id },
        select: {
          id: true,
          following: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          createdAt: true,
        },
        orderBy: { id: 'desc' },
        take: pagination.limit + 1,
        ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      }),
      this.prisma.follow.count({ where: { followerId: id } }),
    ]);

    const page = splitPage(follows, pagination.limit, (follow) => follow.id);

    const following: FollowerData[] = page.items.map((f) => ({
      id: f.following.id,
      name: f.following.name,
      email: f.following.email,
      avatarUrl: f.following.avatarUrl,
      followedAt: f.createdAt,
    }));

    const result = { user, following, total, nextCursor: page.nextCursor };
    await cache.set(cacheKey, result, USER_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  /** Creates a follow relation. */
  async followUser(followerId: number, followingId: number): Promise<void> {
    const fid = validateUserId(followerId);
    const gid = validateUserId(followingId);

    if (fid === gid) throw new SelfFollowError();

    const [follower, following] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: fid }, select: userSummarySelect }),
      this.prisma.user.findUnique({ where: { id: gid }, select: userSummarySelect }),
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

    await invalidateFollowCaches(fid, gid);
    await publishFollowEvent('follow.created', follower, following);
  }

  /** Removes a follow relation. */
  async unfollowUser(followerId: number, followingId: number): Promise<void> {
    const fid = validateUserId(followerId);
    const gid = validateUserId(followingId);

    if (fid === gid) throw new SelfFollowError();

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: fid, followingId: gid } },
      select: {
        follower: { select: userSummarySelect },
        following: { select: userSummarySelect },
      },
    });
    if (!existing) throw new NotFollowingError();

    await this.prisma.follow.delete({
      where: { followerId_followingId: { followerId: fid, followingId: gid } },
    });

    await invalidateFollowCaches(fid, gid);
    await publishFollowEvent(
      'follow.deleted',
      existing.follower,
      existing.following
    );
  }

  /** Checks whether one user follows another. */
  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    const fid = validateUserId(followerId);
    const gid = validateUserId(followingId);
    const cacheKey = userCacheKeys.isFollowing(fid, gid);
    const cached = await cache.get<boolean>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: fid, followingId: gid } },
    });
    const result = !!existing;
    await cache.set(cacheKey, result, USER_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  /** Returns follower and following counts for a user. */
  async getCounts(userId: number) {
    const id = validateUserId(userId);
    const cacheKey = userCacheKeys.followCounts(id);
    const cached = await cache.get<{ followersCount: number; followingCount: number }>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const [followersCount, followingCount] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: id } }),
      this.prisma.follow.count({ where: { followerId: id } }),
    ]);

    const result = { followersCount, followingCount };
    await cache.set(cacheKey, result, USER_LIST_CACHE_TTL_SECONDS);
    return result;
  }
}