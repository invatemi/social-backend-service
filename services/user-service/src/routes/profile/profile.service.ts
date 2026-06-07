import { PrismaClient } from '../../generated/prisma/client';
import { eventBus } from '../../middleware/event-bus';
import { UserNotFoundError, ValidationError } from '../followers/followers.errors';
import { cache } from '../../middleware/redis';
import {
  invalidateUserProfileCache,
  USER_CACHE_TTL_SECONDS,
  userCacheKeys,
} from '../../middleware/user-cache';

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
}

const validateUserId = (userId: unknown): number => {
  const id = Number(userId);
  if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid user ID', 'userId');
  }
  return id;
};

export class ProfileService {
  constructor(private prisma: PrismaClient) {}

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
    await cache.set(userCacheKeys.byId(id), updatedUser, USER_CACHE_TTL_SECONDS);

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
