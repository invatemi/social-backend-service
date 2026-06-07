import type { PrismaClient } from '@prisma/client/index';
import { eventBus } from '../../middleware/event-bus';
import {
  PostValidationError,
  PostNotFoundError,
  PostForbiddenError,
  PostAlreadyPublishedError,
  PostAlreadyDraftError,
} from './post.errors';
import { cache } from '../../middleware/redis';

// ==================== TYPES ====================
export interface CreatePostData {
  userId: number;
  title?: string;
  content: string;
  imageUrl?: string;
  isPublished?: boolean;
}

export interface UpdatePostData {
  title?: string;
  content?: string;
  imageUrl?: string;
}

export interface PostResponse {
  id: number;
  userId: number;
  title: string | null;
  content: string;
  imageUrl: string | null;
  isPublished: boolean;
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostsListResponse {
  posts: PostResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  onlyPublished?: boolean;
}

const POST_CACHE_TTL_SECONDS = Number(process.env.POST_CACHE_TTL_SECONDS ?? 300);
const POST_LIST_CACHE_TTL_SECONDS = Number(process.env.POST_LIST_CACHE_TTL_SECONDS ?? 60);

const postCacheKeys = {
  byId: (postId: number) => `post:${postId}`,
  feed: (page: number, pageSize: number, onlyPublished: boolean) =>
    `posts:feed:published:${onlyPublished}:page:${page}:size:${pageSize}`,
  byUser: (userId: number, page: number, pageSize: number, onlyPublished: boolean) =>
    `posts:user:${userId}:published:${onlyPublished}:page:${page}:size:${pageSize}`,
  ownByUser: (userId: number, page: number, pageSize: number) =>
    `posts:user:${userId}:own:page:${page}:size:${pageSize}`,
};

const invalidatePostLists = async (userId: number): Promise<void> => {
  await Promise.all([
    cache.delPattern('posts:feed:*'),
    cache.delPattern(`posts:user:${userId}:*`),
  ]);
};

const publishPostEvent = async (
  routingKey: 'post.created' | 'post.updated' | 'post.deleted',
  post: PostResponse
): Promise<void> => {
  try {
    await eventBus.publish(routingKey, {
      postId: post.id,
      userId: post.userId,
      title: post.title,
      content: post.content,
      imageUrl: post.imageUrl,
      isPublished: post.isPublished,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.log(`[EventBus] Failed to publish ${routingKey}:`, error);
  }
};

// ==================== VALIDATION HELPERS ====================
const validateId = (value: unknown, fieldName: string): number => {
  const id = Number(value);
  if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
    throw new PostValidationError(`Invalid ${fieldName}`, fieldName);
  }
  return id;
};

const validateTitle = (title: unknown): string | undefined => {
  if (title === undefined || title === null) {
    return undefined;
  }
  
  if (typeof title !== 'string') {
    throw new PostValidationError('Title must be a string', 'title');
  }
  
  const trimmed = title.trim();
  
  if (trimmed.length === 0) {
    return undefined;
  }
  
  if (trimmed.length > 150) {
    throw new PostValidationError('Title must be less than 150 characters', 'title');
  }
  
  return trimmed;
};

const validateContent = (content: unknown): string => {
  if (typeof content !== 'string') {
    throw new PostValidationError('Content must be a string', 'content');
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    throw new PostValidationError('Content cannot be empty', 'content');
  }
  
  if (trimmed.length > 10000) {
    throw new PostValidationError('Content must be less than 10000 characters', 'content');
  }
  
  return trimmed;
};

const validateImageUrl = (imageUrl: unknown): string | undefined => {
  if (imageUrl === undefined || imageUrl === null) {
    return undefined;
  }
  
  if (typeof imageUrl !== 'string') {
    throw new PostValidationError('Image URL must be a string', 'imageUrl');
  }
  
  const trimmed = imageUrl.trim();
  
  if (trimmed.length === 0) {
    return undefined;
  }
  
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    throw new PostValidationError('Invalid image URL format', 'imageUrl');
  }
};

// ==================== POST SERVICE ====================
export class PostService {
  constructor(private prisma: PrismaClient) {}

  // ==================== CREATE POST ====================
  async createPost(data: CreatePostData): Promise<PostResponse> {
    const userId = validateId(data.userId, 'userId');
    const title = validateTitle(data.title);
    const content = validateContent(data.content);
    const imageUrl = validateImageUrl(data.imageUrl);
    const isPublished = data.isPublished ?? true;

    const post = await this.prisma.posts.create({
      data: {
        id_user: userId,
        title,
        content,
        image_url: imageUrl,
        is_published: isPublished,
      },
    });

    const createdPost = this.formatPost(post);
    await Promise.all([
      cache.set(postCacheKeys.byId(createdPost.id), createdPost, POST_CACHE_TTL_SECONDS),
      invalidatePostLists(createdPost.userId),
    ]);
    await publishPostEvent('post.created', createdPost);

    return createdPost;
  }

  // ==================== GET ALL POSTS (FEED) ====================
  async getAllPosts(options: PaginationOptions = {}): Promise<PostsListResponse> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 10;
    const onlyPublished = options.onlyPublished ?? true;

    if (page < 1) {
      throw new PostValidationError('Page must be greater than 0', 'page');
    }
    
    if (pageSize < 1 || pageSize > 100) {
      throw new PostValidationError('Page size must be between 1 and 100', 'pageSize');
    }

    const where = onlyPublished ? { is_published: true } : {};
    const cacheKey = postCacheKeys.feed(page, pageSize, onlyPublished);
    const cached = await cache.get<PostsListResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const [posts, total] = await Promise.all([
      this.prisma.posts.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.posts.count({ where }),
    ]);

    const result = {
      posts: posts.map(this.formatPost),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await cache.set(cacheKey, result, POST_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  // ==================== GET POSTS BY USER ====================
  async getPostsByUser(
    userId: number,
    options: PaginationOptions = {}
  ): Promise<PostsListResponse> {
    const validUserId = validateId(userId, 'userId');
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 10;
    const onlyPublished = options.onlyPublished ?? true;

    if (page < 1) {
      throw new PostValidationError('Page must be greater than 0', 'page');
    }
    
    if (pageSize < 1 || pageSize > 100) {
      throw new PostValidationError('Page size must be between 1 and 100', 'pageSize');
    }

    const where = {
      id_user: validUserId,
      ...(onlyPublished && { is_published: true }),
    };
    const cacheKey = postCacheKeys.byUser(validUserId, page, pageSize, onlyPublished);
    const cached = await cache.get<PostsListResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const [posts, total] = await Promise.all([
      this.prisma.posts.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.posts.count({ where }),
    ]);

    const result = {
      posts: posts.map(this.formatPost),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await cache.set(cacheKey, result, POST_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  // ==================== GET POST BY ID ====================
  async getPostById(postId: number): Promise<PostResponse> {
    const validPostId = validateId(postId, 'postId');
    const cacheKey = postCacheKeys.byId(validPostId);
    const cached = await cache.get<PostResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const post = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
    });

    if (!post) {
      throw new PostNotFoundError(validPostId);
    }

    const result = this.formatPost(post);
    await cache.set(cacheKey, result, POST_CACHE_TTL_SECONDS);
    return result;
  }

  // ==================== UPDATE POST ====================
  async updatePost(
    postId: number,
    userId: number,
    data: UpdatePostData
  ): Promise<PostResponse> {
    const validPostId = validateId(postId, 'postId');
    const validUserId = validateId(userId, 'userId');

    const post = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
    });

    if (!post) {
      throw new PostNotFoundError(validPostId);
    }

    if (post.id_user !== validUserId) {
      throw new PostForbiddenError('You can only edit your own posts');
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (data.title !== undefined) {
      updateData.title = validateTitle(data.title);
    }

    if (data.content !== undefined) {
      updateData.content = validateContent(data.content);
    }

    if (data.imageUrl !== undefined) {
      updateData.image_url = validateImageUrl(data.imageUrl);
    }

    const updatedPost = await this.prisma.posts.update({
      where: { id_post: validPostId },
      data: updateData,
    });

    const formattedPost = this.formatPost(updatedPost);
    await Promise.all([
      cache.set(postCacheKeys.byId(formattedPost.id), formattedPost, POST_CACHE_TTL_SECONDS),
      invalidatePostLists(formattedPost.userId),
    ]);
    await publishPostEvent('post.updated', formattedPost);

    return formattedPost;
  }

  // ==================== DELETE POST ====================
  async deletePost(postId: number, userId: number): Promise<void> {
    const validPostId = validateId(postId, 'postId');
    const validUserId = validateId(userId, 'userId');

    const post = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
    });

    if (!post) {
      throw new PostNotFoundError(validPostId);
    }

    if (post.id_user !== validUserId) {
      throw new PostForbiddenError('You can only delete your own posts');
    }

    const deletedPost = this.formatPost(post);

    await this.prisma.posts.delete({
      where: { id_post: validPostId },
    });

    await publishPostEvent('post.deleted', deletedPost);
    await Promise.all([
      cache.del(postCacheKeys.byId(deletedPost.id)),
      invalidatePostLists(deletedPost.userId),
    ]);
  }

  // ==================== PUBLISH POST ====================
  async publishPost(postId: number, userId: number): Promise<PostResponse> {
    const validPostId = validateId(postId, 'postId');
    const validUserId = validateId(userId, 'userId');

    const post = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
    });

    if (!post) {
      throw new PostNotFoundError(validPostId);
    }

    if (post.id_user !== validUserId) {
      throw new PostForbiddenError('You can only publish your own posts');
    }

    if (post.is_published) {
      throw new PostAlreadyPublishedError();
    }

    const updatedPost = await this.prisma.posts.update({
      where: { id_post: validPostId },
      data: {
        is_published: true,
        updated_at: new Date(),
      },
    });

    const formattedPost = this.formatPost(updatedPost);
    await Promise.all([
      cache.set(postCacheKeys.byId(formattedPost.id), formattedPost, POST_CACHE_TTL_SECONDS),
      invalidatePostLists(formattedPost.userId),
    ]);

    return formattedPost;
  }

  // ==================== UNPUBLISH POST (MAKE DRAFT) ====================
  async unpublishPost(postId: number, userId: number): Promise<PostResponse> {
    const validPostId = validateId(postId, 'postId');
    const validUserId = validateId(userId, 'userId');

    const post = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
    });

    if (!post) {
      throw new PostNotFoundError(validPostId);
    }

    if (post.id_user !== validUserId) {
      throw new PostForbiddenError('You can only unpublish your own posts');
    }

    if (!post.is_published) {
      throw new PostAlreadyDraftError();
    }

    const updatedPost = await this.prisma.posts.update({
      where: { id_post: validPostId },
      data: {
        is_published: false,
        updated_at: new Date(),
      },
    });

    const formattedPost = this.formatPost(updatedPost);
    await Promise.all([
      cache.set(postCacheKeys.byId(formattedPost.id), formattedPost, POST_CACHE_TTL_SECONDS),
      invalidatePostLists(formattedPost.userId),
    ]);

    return formattedPost;
  }

  // ==================== GET MY POSTS (INCLUDING DRAFTS) ====================
  async getMyPosts(
    userId: number,
    options: PaginationOptions = {}
  ): Promise<PostsListResponse> {
    const validUserId = validateId(userId, 'userId');
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 10;

    if (page < 1) {
      throw new PostValidationError('Page must be greater than 0', 'page');
    }
    
    if (pageSize < 1 || pageSize > 100) {
      throw new PostValidationError('Page size must be between 1 and 100', 'pageSize');
    }

    const where = { id_user: validUserId };
    const cacheKey = postCacheKeys.ownByUser(validUserId, page, pageSize);
    const cached = await cache.get<PostsListResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const [posts, total] = await Promise.all([
      this.prisma.posts.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.posts.count({ where }),
    ]);

    const result = {
      posts: posts.map(this.formatPost),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await cache.set(cacheKey, result, POST_LIST_CACHE_TTL_SECONDS);
    return result;
  }

  // ==================== FORMAT POST ====================
  private formatPost(post: any): PostResponse {
    return {
      id: post.id_post,
      userId: post.id_user,
      title: post.title,
      content: post.content,
      imageUrl: post.image_url,
      isPublished: post.is_published,
      likesCount: post.likes_count,
      commentsCount: post.comments_count,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    };
  }
}