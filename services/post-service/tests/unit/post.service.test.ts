import { PostService } from '../../src/routes/post/post.service';
import { PostNotFoundError, PostValidationError } from '../../src/routes/post/post.errors';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    postCacheTtlSeconds: 60,
    postListCacheTtlSeconds: 60,
    defaultPage: 1,
    defaultPageSize: 10,
  }),
}));

jest.mock('../../src/middleware/redis', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delPattern: jest.fn(),
  },
}));

jest.mock('../../src/middleware/event-bus', () => ({
  eventBus: { publish: jest.fn() },
}));

jest.mock('../../src/clients/user-client', () => ({
  fetchAuthorsByIds: jest.fn(async (ids: number[]) => {
    const map = new Map<number, { id: number; username: string; avatarUrl: string | null }>();
    for (const id of ids) {
      map.set(id, { id, username: `user_${id}`, avatarUrl: null });
    }
    return map;
  }),
  fetchFeedSourceUserIds: jest.fn(async () => [1, 2]),
}));

describe('PostService unit', () => {
  const prismaMock = {
    posts: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    likes: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createPost: happy path', async () => {
    prismaMock.posts.create.mockResolvedValue({
      id_post: 1,
      id_user: 77,
      title: 'Hello',
      content: 'Post content',
      image_url: null,
      is_published: true,
      likes_count: 0,
      comments_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const service = new PostService(prismaMock as any);

    const result = await service.createPost({ userId: 77, content: 'Post content' });

    expect(result.id).toBe(1);
    expect(result.userId).toBe(77);
    expect(prismaMock.posts.create).toHaveBeenCalled();
  });

  it('getAllPosts: page validation edge-case', async () => {
    const service = new PostService(prismaMock as any);

    await expect(service.getAllPosts({ page: 0, pageSize: 10 })).rejects.toBeInstanceOf(
      PostValidationError
    );
  });

  it('toggleLike: бросает PostNotFoundError когда пост отсутствует', async () => {
    prismaMock.posts.findUnique.mockResolvedValue(null);
    const service = new PostService(prismaMock as any);

    await expect(service.toggleLike(10, 11)).rejects.toBeInstanceOf(PostNotFoundError);
  });
});
