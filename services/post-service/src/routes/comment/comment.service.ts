import { PrismaClient } from '../../generated/prisma/client';
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
}

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

// ==================== FORMATTER ====================
// Преобразуем snake_case поля из БД в camelCase для API
const formatComment = (comment: any): CommentResponse => ({
  id: comment.id_comment,
  postId: comment.id_post,
  userId: comment.id_user,
  content: comment.content,
  createdAt: comment.created_at,
});

// ==================== COMMENT SERVICE ====================
export class CommentService {
  constructor(private prisma: PrismaClient) {}

  // ==================== CREATE COMMENT ====================
  async createComment(data: CreateCommentData): Promise<CommentResponse> {
    const postId = validateId(data.postId, 'postId');
    const userId = validateId(data.userId, 'userId');
    const content = validateContent(data.content);

    // Проверяем, что пост существует (используем posts, а не post)
    const post = await this.prisma.posts.findUnique({
      where: { id_post: postId },
      select: { id_post: true },
    });

    if (!post) {
      throw new PostNotFoundError(postId);
    }

    // Создаём комментарий (используем comments, а не comment)
    const comment = await this.prisma.comments.create({
      data: {
        id_post: postId,
        id_user: userId,
        content,
      },
    });

    // Обновляем счётчик комментариев в посте
    await this.prisma.posts.update({
      where: { id_post: postId },
      data: {
        comments_count: { increment: 1 },
        updated_at: new Date(),
      },
    });

    return formatComment(comment);
  }

  // ==================== GET COMMENTS BY POST ====================
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

    return {
      comments: comments.map(formatComment),
      total: comments.length,
      post: { id: validPostId },
    };
  }

  // ==================== GET COMMENT BY ID ====================
  async getCommentById(commentId: number): Promise<CommentResponse> {
    const validCommentId = validateId(commentId, 'commentId');

    const comment = await this.prisma.comments.findUnique({
      where: { id_comment: validCommentId },
    });

    if (!comment) {
      throw new CommentNotFoundError(validCommentId);
    }

    return formatComment(comment);
  }

  // ==================== UPDATE COMMENT ====================
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

    return formatComment(updatedComment);
  }

  // ==================== DELETE COMMENT ====================
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

    // Удаляем комментарий
    await this.prisma.comments.delete({
      where: { id_comment: validCommentId },
    });

    // Уменьшаем счётчик комментариев в посте
    await this.prisma.posts.update({
      where: { id_post: comment.id_post },
      data: {
        comments_count: { decrement: 1 },
        updated_at: new Date(),
      },
    });
  }

  // ==================== GET COMMENTS COUNT ====================
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