import type { PrismaClient } from '../../generated/prisma';
import { eventBus } from '../../middleware/event-bus';
import { fetchAuthorsByIds, type PostAuthor } from '../../clients/user-client';
import {
  ValidationError,
  CommentNotFoundError,
  PostNotFoundError,
  ForbiddenError,
} from './comment.errors';

// ==================== TYPES ====================
export interface CreateCommentData {
  postId: number;
  userId: number;
  content: string;
}

export interface UpdateCommentData {
  content: string;
}

export interface CommentResponse {
  id: number;
  postId: number;
  userId: number;
  content: string;
  createdAt: Date;
  author: PostAuthor;
}

type CommentRecord = {
  id: number;
  postId: number;
  userId: number;
  content: string;
  createdAt: Date;
};

export interface CommentsListResponse {
  comments: CommentResponse[];
  total: number;
  post: {
    id: number;
  };
}

// ==================== VALIDATION HELPERS ====================
const validateId = (value: unknown, fieldName: string): number => {
  const id = Number(value);
  if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`Invalid ${fieldName}`, fieldName);
  }
  return id;
};

const validateContent = (content: unknown): string => {
  if (typeof content !== 'string') {
    throw new ValidationError('Content must be a string', 'content');
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    throw new ValidationError('Content cannot be empty', 'content');
  }
  
  if (trimmed.length > 5000) {
    throw new ValidationError('Content must be less than 5000 characters', 'content');
  }
  
  return trimmed;
};

// Преобразует snake_case поля из БД в camelCase для API.
const formatComment = (comment: any): CommentRecord => ({
  id: comment.id_comment,
  postId: comment.id_post,
  userId: comment.id_user,
  content: comment.content,
  createdAt: comment.created_at,
});

const fallbackAuthor = (userId: number): PostAuthor => ({
  id: userId,
  username: `user_${userId}`,
  avatarUrl: null,
});

const enrichCommentsWithAuthors = async (
  comments: CommentRecord[]
): Promise<CommentResponse[]> => {
  const authorsMap = await fetchAuthorsByIds(comments.map((comment) => comment.userId));

  return comments.map((comment) => ({
    ...comment,
    author: authorsMap.get(comment.userId) ?? fallbackAuthor(comment.userId),
  }));
};

const enrichCommentWithAuthor = async (comment: CommentRecord): Promise<CommentResponse> => {
  const [enriched] = await enrichCommentsWithAuthors([comment]);
  return enriched;
};

const publishCommentEvent = async (
  routingKey: 'comment.created' | 'comment.updated' | 'comment.deleted',
  comment: CommentRecord,
  postAuthorId: number,
  commentsCount: number
): Promise<void> => {
  try {
    await eventBus.publish(routingKey, {
      commentId: comment.id,
      postId: comment.postId,
      userId: comment.userId,
      postAuthorId,
      content: comment.content,
      commentsCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.log(`[EventBus] Failed to publish ${routingKey}:`, error);
  }
};

// ==================== COMMENT SERVICE ====================
export class CommentService {
  constructor(private prisma: PrismaClient) {}

  /** Creates a comment and increments the post comment count. */
  async createComment(data: CreateCommentData): Promise<CommentResponse> {
    const postId = validateId(data.postId, 'postId');
    const userId = validateId(data.userId, 'userId');
    const content = validateContent(data.content);

    // Проверяем, что пост существует (используем posts, а не post)
    const post = await this.prisma.posts.findUnique({
      where: { id_post: postId },
      select: { id_post: true, id_user: true },
    });

    if (!post) {
      throw new PostNotFoundError(postId);
    }

    const { createdComment, commentsCount } = await this.prisma.$transaction(async (tx) => {
      const commentRow = await tx.comments.create({
        data: {
          id_post: postId,
          id_user: userId,
          content,
        },
      });

      const updatedPost = await tx.posts.update({
        where: { id_post: postId },
        data: {
          comments_count: { increment: 1 },
          updated_at: new Date(),
        },
        select: { comments_count: true },
      });

      return {
        createdComment: commentRow,
        commentsCount: updatedPost.comments_count,
      };
    });

    const formattedComment = formatComment(createdComment);
    await publishCommentEvent(
      'comment.created',
      formattedComment,
      post.id_user,
      commentsCount
    );

    return enrichCommentWithAuthor(formattedComment);
  }

  /** Returns comments for a post. */
  async getCommentsByPost(postId: number): Promise<CommentsListResponse> {
    const validPostId = validateId(postId, 'postId');

    // Проверяем, что пост существует
    const post = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
      select: { id_post: true },
    });

    if (!post) {
      throw new PostNotFoundError(validPostId);
    }

    // Получаем комментарии
    const comments = await this.prisma.comments.findMany({
      where: { id_post: validPostId },
      orderBy: { created_at: 'desc' },
    });

    const formatted = comments.map(formatComment);

    return {
      comments: await enrichCommentsWithAuthors(formatted),
      total: formatted.length,
      post: { id: validPostId },
    };
  }

  /** Returns a comment by id. */
  async getCommentById(commentId: number): Promise<CommentResponse> {
    const validCommentId = validateId(commentId, 'commentId');

    const comment = await this.prisma.comments.findUnique({
      where: { id_comment: validCommentId },
    });

    if (!comment) {
      throw new CommentNotFoundError(validCommentId);
    }

    return enrichCommentWithAuthor(formatComment(comment));
  }

  /** Updates an owned comment. */
  async updateComment(
    commentId: number,
    userId: number,
    data: UpdateCommentData
  ): Promise<CommentResponse> {
    const validCommentId = validateId(commentId, 'commentId');
    const validUserId = validateId(userId, 'userId');
    const content = validateContent(data.content);

    // Получаем комментарий
    const comment = await this.prisma.comments.findUnique({
      where: { id_comment: validCommentId },
    });

    if (!comment) {
      throw new CommentNotFoundError(validCommentId);
    }

    // Проверяем, что пользователь является автором
    if (comment.id_user !== validUserId) {
      throw new ForbiddenError('You can only edit your own comments');
    }

    // Обновляем комментарий
    const updatedComment = await this.prisma.comments.update({
      where: { id_comment: validCommentId },
      data: { content },
    });

    const post = await this.prisma.posts.findUnique({
      where: { id_post: comment.id_post },
      select: { id_user: true, comments_count: true },
    });

    const formattedComment = formatComment(updatedComment);
    if (post) {
      await publishCommentEvent(
        'comment.updated',
        formattedComment,
        post.id_user,
        post.comments_count
      );
    }

    return enrichCommentWithAuthor(formattedComment);
  }

  /** Deletes an owned comment and decrements the post comment count. */
  async deleteComment(commentId: number, userId: number): Promise<void> {
    const validCommentId = validateId(commentId, 'commentId');
    const validUserId = validateId(userId, 'userId');

    // Получаем комментарий
    const comment = await this.prisma.comments.findUnique({
      where: { id_comment: validCommentId },
    });

    if (!comment) {
      throw new CommentNotFoundError(validCommentId);
    }

    // Проверяем, что пользователь является автором
    if (comment.id_user !== validUserId) {
      throw new ForbiddenError('You can only delete your own comments');
    }

    const deletedComment = formatComment(comment);

    const updatedPost = await this.prisma.$transaction(async (tx) => {
      await tx.comments.delete({
        where: { id_comment: validCommentId },
      });

      return tx.posts.update({
        where: { id_post: comment.id_post },
        data: {
          comments_count: { decrement: 1 },
          updated_at: new Date(),
        },
        select: { id_user: true, comments_count: true },
      });
    });

    if (updatedPost) {
      await publishCommentEvent(
        'comment.deleted',
        deletedComment,
        updatedPost.id_user,
        updatedPost.comments_count
      );
    }
  }

  /** Returns the number of comments for a post. */
  async getCommentsCount(postId: number): Promise<{ count: number }> {
    const validPostId = validateId(postId, 'postId');

    // Проверяем, что пост существует
    const post = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
      select: { id_post: true },
    });

    if (!post) {
      throw new PostNotFoundError(validPostId);
    }

    const count = await this.prisma.comments.count({
      where: { id_post: validPostId },
    });

    return { count };
  }
}