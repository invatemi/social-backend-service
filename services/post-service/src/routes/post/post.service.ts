import { randomUUID } from 'crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PrismaClient } from '../../generated/prisma';
import { eventBus } from '../../middleware/event-bus';
import {
  PostValidationError,
  PostNotFoundError,
  PostForbiddenError,
  PostAlreadyPublishedError,
  PostAlreadyDraftError,
} from './post.errors';
import { cache } from '../../middleware/redis';
import {
  fetchAuthorsByIds,
  fetchFeedSourceUserIds,
  type PostAuthor,
} from '../../clients/user-client';
import { getConfig } from '../../config/env';

// ==================== TYPES ====================
export interface CreatePostData {
  userId: number;
  title?: string;
  content?: string;
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

export interface EnrichedPostResponse extends PostResponse {
  author: PostAuthor;
  isLiked?: boolean;
}

export interface PostsListResponse {
  posts: EnrichedPostResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PostImageUploadUrlInput {
  contentType?: string;
  fileName?: string;
}

export interface PostImageUploadUrlData {
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  headers: { 'Content-Type': string };
  expiresIn: number;
  key: string;
}

type CachedPostsListResponse = {
  posts: PostResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  onlyPublished?: boolean;
}

type DbPost = {
  id_post: number;
  id_user: number;
  title: string | null;
  content: string;
  image_url: string | null;
  is_published: boolean;
  likes_count: number;
  comments_count: number;
  created_at: Date;
  updated_at: Date;
};

type PostUpdateFields = {
  updated_at: Date;
  title?: string;
  content?: string;
  image_url?: string | null;
};

const postCacheKeys = {
  byId: (postId: number) => `post:${postId}`,
  feed: (page: number, pageSize: number, onlyPublished: boolean) =>
    `posts:feed:published:${onlyPublished}:page:${page}:size:${pageSize}`,
  userFeed: (userId: number, page: number, pageSize: number, onlyPublished: boolean) =>
    `posts:feed:user:${userId}:published:${onlyPublished}:page:${page}:size:${pageSize}`,
  byUser: (userId: number, page: number, pageSize: number, onlyPublished: boolean) =>
    `posts:user:${userId}:published:${onlyPublished}:page:${page}:size:${pageSize}`,
  ownByUser: (userId: number, page: number, pageSize: number) =>
    `posts:user:${userId}:own:page:${page}:size:${pageSize}`,
};

const sanitizeFileName = (fileName: string | undefined): string => {
  const sanitized = String(fileName ?? 'post-image')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

  return sanitized || 'post-image';
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

const createS3Client = (forBrowserUpload = false): S3Client => {
  const {
    s3Endpoint,
    s3PublicBaseUrl,
    s3UploadEndpoint,
    s3Region,
    s3ForcePathStyle,
    s3AccessKeyId,
    s3SecretAccessKey,
  } = getConfig();

  const endpoint = forBrowserUpload
    ? resolveUploadEndpoint(s3PublicBaseUrl, s3UploadEndpoint)
    : s3Endpoint || resolveUploadEndpoint(s3PublicBaseUrl, s3UploadEndpoint);

  return new S3Client({
    region: s3Region,
    endpoint,
    forcePathStyle: s3ForcePathStyle,
    credentials: {
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
    },
  });
};

const extractObjectKey = (url: string): string | null => {
  try {
    const { s3PublicBaseUrl } = getConfig();
    const base = s3PublicBaseUrl.replace(/\/+$/, '');
    if (!url.startsWith(base + '/')) {
      return null;
    }
    return decodeURIComponent(url.slice(base.length + 1));
  } catch {
    return null;
  }
};

const deleteObjectFromStorage = async (objectKey: string | null): Promise<void> => {
  if (!objectKey) {
    return;
  }

  try {
    const { s3Bucket } = getConfig();
    const client = createS3Client(false);
    await client.send(
      new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: objectKey,
      })
    );
  } catch (error) {
    console.log('[Post] Failed to delete S3 object:', error);
  }
};

const invalidatePostLists = async (userId: number): Promise<void> => {
  await Promise.all([
    cache.delPattern('posts:feed:*'),
    cache.delPattern(`posts:user:${userId}:*`),
  ]);
};

const publishPostEvent = async (
  routingKey: 'post.created' | 'post.updated',
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
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.log(`[EventBus] Failed to publish ${routingKey}:`, error);
  }
};

const publishPostDeletedEvent = async (postId: number, userId: number): Promise<void> => {
  try {
    await eventBus.publish('post.deleted', {
      postId,
      userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.log('[EventBus] Failed to publish post.deleted:', error);
  }
};

const publishLikeEvent = async (
  postAuthorId: number,
  data: {
    postId: number;
    userId: number;
    liked: boolean;
    likesCount: number;
  }
): Promise<void> => {
  try {
    await eventBus.publish('post.liked', {
      postId: data.postId,
      userId: data.userId,
      postAuthorId,
      liked: data.liked,
      likesCount: data.likesCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.log('[EventBus] Failed to publish post.liked:', error);
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

const validateCreateContent = (content: unknown, imageUrl?: string | null): string => {
  if (content === undefined || content === null) {
    if (imageUrl) {
      return '';
    }

    throw new PostValidationError('Content must be a string', 'content');
  }

  if (typeof content !== 'string') {
    throw new PostValidationError('Content must be a string', 'content');
  }

  const trimmed = content.trim();

  if (trimmed.length === 0 && !imageUrl) {
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

  if (trimmed.startsWith('data:')) {
    throw new PostValidationError(
      'Inline data URLs are not allowed; upload the image first',
      'imageUrl'
    );
  }
  
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PostValidationError('Invalid image URL format', 'imageUrl');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PostValidationError('Image URL must use http or https', 'imageUrl');
  }

  const { s3PublicBaseUrl } = getConfig();
  const base = s3PublicBaseUrl.replace(/\/+$/, '');
  if (!trimmed.startsWith(base + '/')) {
    throw new PostValidationError('Image URL must point to the media storage', 'imageUrl');
  }

  return trimmed;
};

const enrichPostsWithAuthors = async (posts: PostResponse[]): Promise<EnrichedPostResponse[]> => {
  const authorsMap = await fetchAuthorsByIds(posts.map((post) => post.userId));

  return posts.map((post) => ({
    ...post,
    author: authorsMap.get(post.userId) ?? {
      id: post.userId,
      username: `user_${post.userId}`,
      avatarUrl: null,
    },
  }));
};

const enrichPostsWithLikeStatus = async (
  posts: EnrichedPostResponse[],
  viewerUserId: number,
  prisma: PrismaClient
): Promise<EnrichedPostResponse[]> => {
  if (posts.length === 0) {
    return posts;
  }

  const postIds = posts.map((post) => post.id);
  const likes = await prisma.likes.findMany({
    where: {
      id_user: viewerUserId,
      id_post: { in: postIds },
    },
    select: { id_post: true },
  });

  const likedPostIds = new Set(likes.map((like) => like.id_post));

  return posts.map((post) => ({
    ...post,
    isLiked: likedPostIds.has(post.id),
  }));
};

const enrichPostWithAuthor = async (post: PostResponse): Promise<EnrichedPostResponse> => {
  const [enriched] = await enrichPostsWithAuthors([post]);
  return enriched;
};

// ==================== POST SERVICE ====================
export class PostService {
  constructor(private prisma: PrismaClient) {}

  /** Creates a post and publishes a post.created event. */
  async createPost(data: CreatePostData): Promise<PostResponse> {
    const userId = validateId(data.userId, 'userId');
    const title = validateTitle(data.title);
    const imageUrl = validateImageUrl(data.imageUrl);
    const content = validateCreateContent(data.content, imageUrl);
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
      cache.set(postCacheKeys.byId(createdPost.id), createdPost, getConfig().postCacheTtlSeconds),
      invalidatePostLists(createdPost.userId),
    ]);
    await publishPostEvent('post.created', createdPost);

    return createdPost;
  }

  /** Returns paginated posts for the public feed. */
  async getAllPosts(options: PaginationOptions = {}): Promise<PostsListResponse> {
    const { defaultPage, defaultPageSize } = getConfig();
    const page = options.page ?? defaultPage;
    const pageSize = options.pageSize ?? defaultPageSize;
    const onlyPublished = options.onlyPublished ?? true;

    if (page < 1) {
      throw new PostValidationError('Page must be greater than 0', 'page');
    }
    
    if (pageSize < 1 || pageSize > 100) {
      throw new PostValidationError('Page size must be between 1 and 100', 'pageSize');
    }

    const where = onlyPublished ? { is_published: true } : {};
    const cacheKey = postCacheKeys.feed(page, pageSize, onlyPublished);
    const cached = await cache.get<CachedPostsListResponse>(cacheKey);
    if (cached) {
      return {
        ...cached,
        posts: await enrichPostsWithAuthors(cached.posts),
      };
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

    const rawResult: CachedPostsListResponse = {
      posts: posts.map(this.formatPost),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await cache.set(cacheKey, rawResult, getConfig().postListCacheTtlSeconds);
    return {
      ...rawResult,
      posts: await enrichPostsWithAuthors(rawResult.posts),
    };
  }

  /** Returns paginated published posts from the user's friends and followers. */
  async getFeed(
    userId: number,
    options: PaginationOptions = {}
  ): Promise<PostsListResponse> {
    const validUserId = validateId(userId, 'userId');
    const { defaultPage, defaultPageSize } = getConfig();
    const page = options.page ?? defaultPage;
    const pageSize = options.pageSize ?? defaultPageSize;
    const onlyPublished = options.onlyPublished ?? true;

    if (page < 1) {
      throw new PostValidationError('Page must be greater than 0', 'page');
    }

    if (pageSize < 1 || pageSize > 100) {
      throw new PostValidationError('Page size must be between 1 and 100', 'pageSize');
    }

    const cacheKey = postCacheKeys.userFeed(validUserId, page, pageSize, onlyPublished);
    const cached = await cache.get<CachedPostsListResponse>(cacheKey);
    if (cached) {
      const withAuthors = await enrichPostsWithAuthors(cached.posts);
      return {
        ...cached,
        posts: await enrichPostsWithLikeStatus(withAuthors, validUserId, this.prisma),
      };
    }

    const sourceUserIds = await fetchFeedSourceUserIds(validUserId);

    if (sourceUserIds.length === 0) {
      const emptyResult: CachedPostsListResponse = {
        posts: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };

      await cache.set(cacheKey, emptyResult, getConfig().postListCacheTtlSeconds);
      return {
        ...emptyResult,
        posts: [],
      };
    }

    const where = {
      id_user: { in: sourceUserIds },
      ...(onlyPublished && { is_published: true }),
    };

    const [posts, total] = await Promise.all([
      this.prisma.posts.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.posts.count({ where }),
    ]);

    const rawResult: CachedPostsListResponse = {
      posts: posts.map(this.formatPost),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await cache.set(cacheKey, rawResult, getConfig().postListCacheTtlSeconds);
    const withAuthors = await enrichPostsWithAuthors(rawResult.posts);
    return {
      ...rawResult,
      posts: await enrichPostsWithLikeStatus(withAuthors, validUserId, this.prisma),
    };
  }

  /** Returns paginated posts for a user. */
  async getPostsByUser(
    userId: number,
    options: PaginationOptions = {}
  ): Promise<PostsListResponse> {
    const validUserId = validateId(userId, 'userId');
    const { defaultPage, defaultPageSize } = getConfig();
    const page = options.page ?? defaultPage;
    const pageSize = options.pageSize ?? defaultPageSize;
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
    const cached = await cache.get<CachedPostsListResponse>(cacheKey);
    if (cached) {
      return {
        ...cached,
        posts: await enrichPostsWithAuthors(cached.posts),
      };
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

    const rawResult: CachedPostsListResponse = {
      posts: posts.map(this.formatPost),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await cache.set(cacheKey, rawResult, getConfig().postListCacheTtlSeconds);
    return {
      ...rawResult,
      posts: await enrichPostsWithAuthors(rawResult.posts),
    };
  }

  /** Returns a post by id. */
  async getPostById(postId: number): Promise<EnrichedPostResponse> {
    const validPostId = validateId(postId, 'postId');
    const cacheKey = postCacheKeys.byId(validPostId);
    const cached = await cache.get<PostResponse>(cacheKey);
    if (cached) {
      return enrichPostWithAuthor(cached);
    }

    const post = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
    });

    if (!post) {
      throw new PostNotFoundError(validPostId);
    }

    const result = this.formatPost(post);
    await cache.set(cacheKey, result, getConfig().postCacheTtlSeconds);
    return enrichPostWithAuthor(result);
  }

  /** Updates an owned post and publishes a post.updated event. */
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

    const updateData: PostUpdateFields = {
      updated_at: new Date(),
    };

    if (data.title !== undefined) {
      updateData.title = validateTitle(data.title);
    }

    const nextImageUrl =
      data.imageUrl !== undefined ? validateImageUrl(data.imageUrl) ?? null : post.image_url;

    if (data.imageUrl !== undefined) {
      updateData.image_url = nextImageUrl;
    }

    if (data.content !== undefined) {
      updateData.content = validateCreateContent(data.content, nextImageUrl);
    } else if (data.imageUrl !== undefined && !nextImageUrl && !post.content.trim()) {
      throw new PostValidationError('Content cannot be empty', 'content');
    }

    const updatedPost = await this.prisma.posts.update({
      where: { id_post: validPostId },
      data: updateData,
    });

    const formattedPost = this.formatPost(updatedPost);
    await Promise.all([
      cache.set(postCacheKeys.byId(formattedPost.id), formattedPost, getConfig().postCacheTtlSeconds),
      invalidatePostLists(formattedPost.userId),
    ]);
    await publishPostEvent('post.updated', formattedPost);

    return formattedPost;
  }

  /** Deletes an owned post and publishes a post.deleted event. */
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

    const imageObjectKey = post.image_url ? extractObjectKey(post.image_url) : null;

    await Promise.all([
      cache.del(postCacheKeys.byId(validPostId)),
      invalidatePostLists(validUserId),
    ]);
    await publishPostDeletedEvent(validPostId, validUserId);

    await this.prisma.posts.delete({
      where: { id_post: validPostId },
    });

    await deleteObjectFromStorage(imageObjectKey);
  }

  /** Generates a presigned S3-compatible PUT URL for post image upload. */
  async getImageUploadUrl(
    userId: number,
    input: PostImageUploadUrlInput = {}
  ): Promise<PostImageUploadUrlData> {
    const id = validateId(userId, 'userId');
    const contentType = input.contentType ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new PostValidationError('Image content type must be an image', 'contentType');
    }

    const {
      s3Bucket,
      s3PublicBaseUrl,
      s3UploadUrlTtlSeconds,
    } = getConfig();
    const key = `posts/${id}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
    const client = createS3Client(true);

    const command = new PutObjectCommand({
      Bucket: s3Bucket,
      ContentType: contentType,
      Key: key,
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

  /** Publishes an owned draft post. */
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
      cache.set(postCacheKeys.byId(formattedPost.id), formattedPost, getConfig().postCacheTtlSeconds),
      invalidatePostLists(formattedPost.userId),
    ]);
    await publishPostEvent('post.updated', formattedPost);

    return formattedPost;
  }

  /** Moves an owned published post back to draft. */
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
      cache.set(postCacheKeys.byId(formattedPost.id), formattedPost, getConfig().postCacheTtlSeconds),
      invalidatePostLists(formattedPost.userId),
    ]);
    await publishPostEvent('post.updated', formattedPost);

    return formattedPost;
  }

  /** Returns paginated posts owned by a user, including drafts. */
  async getMyPosts(
    userId: number,
    options: PaginationOptions = {}
  ): Promise<PostsListResponse> {
    const validUserId = validateId(userId, 'userId');
    const { defaultPage, defaultPageSize } = getConfig();
    const page = options.page ?? defaultPage;
    const pageSize = options.pageSize ?? defaultPageSize;

    if (page < 1) {
      throw new PostValidationError('Page must be greater than 0', 'page');
    }
    
    if (pageSize < 1 || pageSize > 100) {
      throw new PostValidationError('Page size must be between 1 and 100', 'pageSize');
    }

    const where = { id_user: validUserId };
    const cacheKey = postCacheKeys.ownByUser(validUserId, page, pageSize);
    const cached = await cache.get<CachedPostsListResponse>(cacheKey);
    if (cached) {
      const withAuthors = await enrichPostsWithAuthors(cached.posts);
      return {
        ...cached,
        posts: await enrichPostsWithLikeStatus(withAuthors, validUserId, this.prisma),
      };
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

    const rawResult: CachedPostsListResponse = {
      posts: posts.map(this.formatPost),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await cache.set(cacheKey, rawResult, getConfig().postListCacheTtlSeconds);
    const withAuthors = await enrichPostsWithAuthors(rawResult.posts);
    return {
      ...rawResult,
      posts: await enrichPostsWithLikeStatus(withAuthors, validUserId, this.prisma),
    };
  }

  /** Toggles a like for a post and returns the updated like state. */
  async toggleLike(
    postId: number,
    userId: number
  ): Promise<{ liked: boolean; likesCount: number }> {
    const validPostId = validateId(postId, 'postId');
    const validUserId = validateId(userId, 'userId');

    const post = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
      select: { id_post: true, id_user: true },
    });

    if (!post) {
      throw new PostNotFoundError(validPostId);
    }

    const existingLike = await this.prisma.likes.findFirst({
      where: {
        id_post: validPostId,
        id_user: validUserId,
      },
      select: { id_like: true },
    });

    if (existingLike) {
      await this.prisma.$transaction([
        this.prisma.likes.delete({
          where: { id_like: existingLike.id_like },
        }),
        this.prisma.posts.update({
          where: { id_post: validPostId },
          data: {
            likes_count: { decrement: 1 },
            updated_at: new Date(),
          },
        }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.likes.create({
          data: {
            id_post: validPostId,
            id_user: validUserId,
          },
        }),
        this.prisma.posts.update({
          where: { id_post: validPostId },
          data: {
            likes_count: { increment: 1 },
            updated_at: new Date(),
          },
        }),
      ]);
    }

    const updatedPost = await this.prisma.posts.findUnique({
      where: { id_post: validPostId },
      select: { likes_count: true },
    });

    const liked = !existingLike;
    const likesCount = updatedPost?.likes_count ?? 0;

    await Promise.all([
      cache.del(postCacheKeys.byId(validPostId)),
      invalidatePostLists(post.id_user),
    ]);

    await publishLikeEvent(post.id_user, {
      postId: validPostId,
      userId: validUserId,
      liked,
      likesCount,
    });

    return { liked, likesCount };
  }

  /** Maps a database post row to the API response shape. */
  private formatPost(post: DbPost): PostResponse {
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