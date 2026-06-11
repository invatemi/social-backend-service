import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaClient } from '../../generated/prisma';
import { eventBus } from '../../middleware/event-bus';
import { UserNotFoundError, ValidationError } from '../followers/followers.errors';
import { cache } from '../../middleware/redis';
import {
  invalidateUserProfileCache,
  getUserCacheTtlSeconds,
  getUserListCacheTtlSeconds,
  userCacheKeys,
} from '../../middleware/user-cache';
import { getConfig } from '../../config/env';
import { PaginationParams, splitPage } from '../../utils/pagination';

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
}

export interface UserProfileData {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  createdAt: Date;
  followersCount: number;
  followingCount: number;
  friendsCount: number;
}

export interface SearchUserData {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
}

export interface PostAuthorData {
  id: number;
  username: string;
  avatarUrl: string | null;
}

export interface AvatarUploadUrlData {
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  headers: { 'Content-Type': string };
  expiresIn: number;
  key: string;
}

export interface AvatarUploadUrlInput {
  contentType?: string;
  fileName?: string;
}

export class AvatarUploadConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarUploadConfigurationError';
  }
}

const validateUserId = (userId: unknown): number => {
  const id = Number(userId);
  if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid user ID', 'userId');
  }
  return id;
};

const validateSearchQuery = (query: unknown): string => {
  const { minSearchQueryLength } = getConfig();
  const value = String(query ?? '').trim();
  if (value.length < minSearchQueryLength) {
    throw new ValidationError(
      `Search query must be at least ${minSearchQueryLength} characters`,
      'q'
    );
  }
  return value;
};

const sanitizeFileName = (fileName: string | undefined): string => {
  const sanitized = String(fileName ?? 'avatar')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

  return sanitized || 'avatar';
};

const joinPublicUrl = (baseUrl: string, key: string): string => {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`;
};

const resolveUploadEndpoint = (publicBaseUrl: string, uploadEndpoint: string): string => {
  if (uploadEndpoint) {
    return uploadEndpoint;
  }
  return new URL(publicBaseUrl).origin;
};

const userProfileSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  bio: true,
  location: true,
  createdAt: true,
} as const;

export class ProfileService {
  constructor(private prisma: PrismaClient) {}

  private async getProfileCounts(userId: number) {
    const [followersCount, followingCount, friendsCount] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: userId } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
      this.prisma.friendship.count({
        where: {
          OR: [{ userId }, { friendId: userId }],
        },
      }),
    ]);

    return { followersCount, followingCount, friendsCount };
  }

  /** Returns a profile with social counters. */
  async getProfile(userId: number): Promise<UserProfileData> {
    const id = validateUserId(userId);
    const cacheKey = userCacheKeys.byId(id);
    const cached = await cache.get<UserProfileData>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userProfileSelect,
    });
    if (!user) throw new UserNotFoundError(id);

    const result = {
      ...user,
      ...(await this.getProfileCounts(id)),
    };

    await cache.set(cacheKey, result, getUserCacheTtlSeconds());
    return result;
  }

  /** Returns user IDs whose published posts should appear in the viewer's feed. */
  async getFeedSourceUserIds(userId: unknown): Promise<number[]> {
    const id = validateUserId(userId);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const [friendships, followers] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { OR: [{ userId: id }, { friendId: id }] },
        select: { userId: true, friendId: true },
      }),
      this.prisma.follow.findMany({
        where: { followingId: id },
        select: { followerId: true },
      }),
    ]);

    const sourceIds = new Set<number>();

    for (const friendship of friendships) {
      sourceIds.add(friendship.userId === id ? friendship.friendId : friendship.userId);
    }

    for (const follow of followers) {
      sourceIds.add(follow.followerId);
    }

    return [...sourceIds];
  }

  /** Returns user IDs that should receive realtime updates for an author's posts. */
  async getPostAudienceUserIds(userId: unknown): Promise<number[]> {
    const id = validateUserId(userId);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const [friendships, following] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { OR: [{ userId: id }, { friendId: id }] },
        select: { userId: true, friendId: true },
      }),
      this.prisma.follow.findMany({
        where: { followerId: id },
        select: { followingId: true },
      }),
    ]);

    const audienceIds = new Set<number>([id]);

    for (const friendship of friendships) {
      audienceIds.add(friendship.userId === id ? friendship.friendId : friendship.userId);
    }

    for (const follow of following) {
      audienceIds.add(follow.followingId);
    }

    return [...audienceIds];
  }

  /** Returns minimal author data for a batch of user IDs (service-to-service). */
  async getAuthorsByIds(userIds: unknown): Promise<PostAuthorData[]> {
    if (!Array.isArray(userIds)) {
      throw new ValidationError('userIds must be an array', 'userIds');
    }

    const uniqueIds = [...new Set(
      userIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];

    if (uniqueIds.length === 0) {
      return [];
    }

    const { maxAuthorsBatchSize } = getConfig();
    if (uniqueIds.length > maxAuthorsBatchSize) {
      throw new ValidationError(
        `userIds must contain at most ${maxAuthorsBatchSize} items`,
        'userIds'
      );
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true, avatarUrl: true },
    });

    return users.map((user) => ({
      id: user.id,
      username: user.name,
      avatarUrl: user.avatarUrl,
    }));
  }

  /** Searches users by name or email. */
  async searchUsers(
    query: unknown,
    pagination: PaginationParams
  ): Promise<{ users: SearchUserData[]; total: number; nextCursor: string | null }> {
    const q = validateSearchQuery(query);
    const cacheKey = userCacheKeys.search(q, pagination);
    const cached = await cache.get<{
      users: SearchUserData[];
      total: number;
      nextCursor: string | null;
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const where = {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          bio: true,
        },
        orderBy: { id: 'desc' },
        take: pagination.limit + 1,
        ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      }),
      this.prisma.user.count({ where }),
    ]);

    const page = splitPage(users, pagination.limit, (user) => user.id);
    const result = {
      users: page.items,
      total,
      nextCursor: page.nextCursor,
    };

    await cache.set(cacheKey, result, getUserListCacheTtlSeconds());
    return result;
  }

  /** Generates a presigned S3-compatible PUT URL for avatar upload. */
  async getAvatarUploadUrl(
    userId: number,
    input: AvatarUploadUrlInput = {}
  ): Promise<AvatarUploadUrlData> {
    const id = validateUserId(userId);
    const contentType = input.contentType ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new ValidationError('Avatar content type must be an image', 'contentType');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new UserNotFoundError(id);

    const {
      s3Bucket,
      s3PublicBaseUrl,
      s3UploadEndpoint,
      s3UploadUrlTtlSeconds,
      s3Region,
      s3ForcePathStyle,
      s3AccessKeyId,
      s3SecretAccessKey,
    } = getConfig();
    const uploadEndpoint = resolveUploadEndpoint(s3PublicBaseUrl, s3UploadEndpoint);
    const key = `avatars/${id}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;

    const client = new S3Client({
      region: s3Region,
      endpoint: uploadEndpoint,
      forcePathStyle: s3ForcePathStyle,
      credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      },
    });

    const command = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: s3UploadUrlTtlSeconds,
      signableHeaders: new Set(['content-type']),
    });

    return {
      uploadUrl,
      publicUrl: joinPublicUrl(s3PublicBaseUrl, key),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresIn: s3UploadUrlTtlSeconds,
      key,
    };
  }

  /** Updates profile fields and publishes a user.updated event. */
  async updateProfile(userId: number, input: UpdateProfileInput) {
    const id = validateUserId(userId);
    const changedFields = Object.keys(input).filter(
      (field) => input[field as keyof UpdateProfileInput] !== undefined
    );

    if (changedFields.length === 0) {
      throw new ValidationError('At least one profile field is required', 'body');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new UserNotFoundError(id);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...input,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        bio: true,
        location: true,
      },
    });

    await invalidateUserProfileCache(id);

    try {
      await eventBus.publish('user.updated', {
        userId: updatedUser.id,
        changedFields,
        user: updatedUser,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.log('[EventBus] Failed to publish user.updated:', error);
    }

    return { user: updatedUser, changedFields };
  }
}
