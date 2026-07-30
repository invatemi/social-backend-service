import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '../../generated/prisma';
import { getConfig } from '../../config/env';
import { invalidateUserProfileCache } from '../../middleware/user-cache';
import { eventBus } from '../../middleware/event-bus';
import {
  ForbiddenError,
  PhotoCommentNotFoundError,
  PhotoNotFoundError,
  UserNotFoundError,
  ValidationError,
} from './photos.errors';

export type PhotoData = {
  id: number;
  userId: number;
  url: string;
  isCurrent: boolean;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: Date;
};

export type PhotoCommentAuthor = {
  id: number;
  username: string;
  avatarUrl: string | null;
};

export type PhotoCommentData = {
  id: number;
  photoId: number;
  userId: number;
  content: string;
  createdAt: Date;
  author: PhotoCommentAuthor;
};

const validateId = (value: unknown, field: string): number => {
  const id = Number(value);
  if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`Invalid ${field}`, field);
  }
  return id;
};

const validateContent = (content: unknown): string => {
  const value = String(content ?? '').trim();
  if (!value) {
    throw new ValidationError('Comment content is required', 'content');
  }
  if (value.length > 2000) {
    throw new ValidationError('Comment content must be at most 2000 characters', 'content');
  }
  return value;
};

const resolveUploadEndpoint = (publicBaseUrl: string, uploadEndpoint: string): string => {
  if (uploadEndpoint) {
    return uploadEndpoint;
  }
  return new URL(publicBaseUrl).origin;
};

export class PhotosService {
  constructor(private prisma: PrismaClient) {}

  private async deleteObjectFromStorage(objectKey: string | null): Promise<void> {
    if (!objectKey) {
      return;
    }

    try {
      const {
        s3Bucket,
        s3Endpoint,
        s3PublicBaseUrl,
        s3UploadEndpoint,
        s3Region,
        s3ForcePathStyle,
        s3AccessKeyId,
        s3SecretAccessKey,
      } = getConfig();

      const client = new S3Client({
        region: s3Region,
        endpoint: s3Endpoint || resolveUploadEndpoint(s3PublicBaseUrl, s3UploadEndpoint),
        forcePathStyle: s3ForcePathStyle,
        credentials: {
          accessKeyId: s3AccessKeyId,
          secretAccessKey: s3SecretAccessKey,
        },
      });

      await client.send(
        new DeleteObjectCommand({
          Bucket: s3Bucket,
          Key: objectKey,
        })
      );
    } catch (error) {
      console.log('[Photos] Failed to delete S3 object:', error);
    }
  }

  /** Returns photos for a user, newest first. */
  async listUserPhotos(userId: unknown, viewerId?: number | null): Promise<PhotoData[]> {
    const id = validateId(userId, 'userId');

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) {
      throw new UserNotFoundError(id);
    }

    const photos = await this.prisma.photo.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        url: true,
        isCurrent: true,
        likesCount: true,
        commentsCount: true,
        createdAt: true,
      },
    });

    let likedPhotoIds = new Set<number>();
    if (viewerId && photos.length > 0) {
      const likes = await this.prisma.photoLike.findMany({
        where: {
          userId: viewerId,
          photoId: { in: photos.map((photo) => photo.id) },
        },
        select: { photoId: true },
      });
      likedPhotoIds = new Set(likes.map((like) => like.photoId));
    }

    return photos.map((photo) => ({
      ...photo,
      isLiked: likedPhotoIds.has(photo.id),
    }));
  }

  /** Deletes an owned photo; clearing current avatar when needed. */
  async deletePhoto(photoId: unknown, requesterId: number): Promise<{ deletedId: number }> {
    const id = validateId(photoId, 'photoId');
    const userId = validateId(requesterId, 'userId');

    const photo = await this.prisma.photo.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        url: true,
        objectKey: true,
        isCurrent: true,
      },
    });

    if (!photo) {
      throw new PhotoNotFoundError(id);
    }

    if (photo.userId !== userId) {
      throw new ForbiddenError('You can only delete your own photos');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: photo.userId },
      select: { avatarUrl: true },
    });

    const clearsAvatar =
      photo.isCurrent || (owner?.avatarUrl != null && owner.avatarUrl === photo.url);

    await this.prisma.$transaction(async (tx) => {
      await tx.photo.delete({ where: { id } });

      if (clearsAvatar) {
        await tx.user.update({
          where: { id: photo.userId },
          data: { avatarUrl: null, updatedAt: new Date() },
        });
      }
    });

    if (clearsAvatar) {
      await invalidateUserProfileCache(photo.userId);
      const ownerProfile = await this.prisma.user.findUnique({
        where: { id: photo.userId },
        select: { id: true, name: true, email: true, avatarUrl: true },
      });
      if (ownerProfile) {
        try {
          await eventBus.publish('user.updated', {
            userId: ownerProfile.id,
            changedFields: ['avatarUrl'],
            user: {
              id: ownerProfile.id,
              name: ownerProfile.name,
              email: ownerProfile.email,
              avatarUrl: ownerProfile.avatarUrl,
            },
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.log('[EventBus] Failed to publish user.updated:', error);
        }
      }
    }

    await this.deleteObjectFromStorage(photo.objectKey);

    try {
      await eventBus.publish('photo.deleted', {
        photoId: id,
        userId: photo.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.log('[EventBus] Failed to publish photo.deleted:', error);
    }

    return { deletedId: id };
  }

  /** Toggles like on a photo. */
  async toggleLike(
    photoId: unknown,
    userId: number
  ): Promise<{ liked: boolean; likesCount: number }> {
    const id = validateId(photoId, 'photoId');
    const validUserId = validateId(userId, 'userId');

    const photo = await this.prisma.photo.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!photo) {
      throw new PhotoNotFoundError(id);
    }

    const existingLike = await this.prisma.photoLike.findUnique({
      where: {
        photoId_userId: { photoId: id, userId: validUserId },
      },
      select: { id: true },
    });

    if (existingLike) {
      await this.prisma.$transaction([
        this.prisma.photoLike.delete({ where: { id: existingLike.id } }),
        this.prisma.photo.update({
          where: { id },
          data: { likesCount: { decrement: 1 } },
        }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.photoLike.create({
          data: { photoId: id, userId: validUserId },
        }),
        this.prisma.photo.update({
          where: { id },
          data: { likesCount: { increment: 1 } },
        }),
      ]);
    }

    const updated = await this.prisma.photo.findUnique({
      where: { id },
      select: { likesCount: true },
    });

    return {
      liked: !existingLike,
      likesCount: Math.max(0, updated?.likesCount ?? 0),
    };
  }

  /** Lists comments for a photo with author profiles. */
  async getComments(photoId: unknown): Promise<{ comments: PhotoCommentData[]; total: number }> {
    const id = validateId(photoId, 'photoId');

    const photo = await this.prisma.photo.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!photo) {
      throw new PhotoNotFoundError(id);
    }

    const comments = await this.prisma.photoComment.findMany({
      where: { photoId: id },
      orderBy: { createdAt: 'desc' },
    });

    const authorIds = [...new Set(comments.map((comment) => comment.userId))];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : [];

    const authorMap = new Map(
      authors.map((author) => [
        author.id,
        {
          id: author.id,
          username: author.name,
          avatarUrl: author.avatarUrl,
        } satisfies PhotoCommentAuthor,
      ])
    );

    const enriched: PhotoCommentData[] = comments.map((comment) => ({
      id: comment.id,
      photoId: comment.photoId,
      userId: comment.userId,
      content: comment.content,
      createdAt: comment.createdAt,
      author: authorMap.get(comment.userId) ?? {
        id: comment.userId,
        username: `user_${comment.userId}`,
        avatarUrl: null,
      },
    }));

    return { comments: enriched, total: enriched.length };
  }

  /** Creates a comment on a photo. */
  async createComment(
    photoId: unknown,
    userId: number,
    content: unknown
  ): Promise<PhotoCommentData> {
    const id = validateId(photoId, 'photoId');
    const validUserId = validateId(userId, 'userId');
    const validContent = validateContent(content);

    const photo = await this.prisma.photo.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!photo) {
      throw new PhotoNotFoundError(id);
    }

    const { comment } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.photoComment.create({
        data: {
          photoId: id,
          userId: validUserId,
          content: validContent,
        },
      });

      await tx.photo.update({
        where: { id },
        data: { commentsCount: { increment: 1 } },
      });

      return { comment: created };
    });

    const author = await this.prisma.user.findUnique({
      where: { id: validUserId },
      select: { id: true, name: true, avatarUrl: true },
    });

    return {
      id: comment.id,
      photoId: comment.photoId,
      userId: comment.userId,
      content: comment.content,
      createdAt: comment.createdAt,
      author: author
        ? { id: author.id, username: author.name, avatarUrl: author.avatarUrl }
        : { id: validUserId, username: `user_${validUserId}`, avatarUrl: null },
    };
  }

  /** Deletes a photo comment (author or photo owner). */
  async deleteComment(
    photoId: unknown,
    commentId: unknown,
    requesterId: number
  ): Promise<{ message: string }> {
    const validPhotoId = validateId(photoId, 'photoId');
    const validCommentId = validateId(commentId, 'commentId');
    const userId = validateId(requesterId, 'userId');

    const comment = await this.prisma.photoComment.findUnique({
      where: { id: validCommentId },
      select: {
        id: true,
        photoId: true,
        userId: true,
        photo: { select: { userId: true } },
      },
    });

    if (!comment || comment.photoId !== validPhotoId) {
      throw new PhotoCommentNotFoundError(validCommentId);
    }

    const canDelete =
      comment.userId === userId || comment.photo.userId === userId;
    if (!canDelete) {
      throw new ForbiddenError('You cannot delete this comment');
    }

    await this.prisma.$transaction([
      this.prisma.photoComment.delete({ where: { id: validCommentId } }),
      this.prisma.photo.update({
        where: { id: validPhotoId },
        data: { commentsCount: { decrement: 1 } },
      }),
    ]);

    return { message: 'Comment deleted' };
  }
}
