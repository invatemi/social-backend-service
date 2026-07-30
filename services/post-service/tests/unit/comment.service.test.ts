import { CommentService } from '../../src/routes/comment/comment.service';
import { CommentNotFoundError, ValidationError } from '../../src/routes/comment/comment.errors';

jest.mock('../../src/middleware/event-bus', () => ({
  eventBus: { publish: jest.fn() },
}));

jest.mock('../../src/clients/user-client', () => ({
  fetchAuthorsByIds: jest.fn(async (ids: number[]) => {
    const map = new Map<number, { id: number; username: string; avatarUrl: string | null }>();
    ids.forEach((id) => {
      map.set(id, { id, username: `user_${id}`, avatarUrl: null });
    });
    return map;
  }),
}));

describe('CommentService unit', () => {
  const prismaMock = {
    posts: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    comments: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createComment: создает комментарий и возвращает формат API', async () => {
    prismaMock.posts.findUnique.mockResolvedValue({ id_post: 1, id_user: 99 });
    prismaMock.$transaction.mockImplementation(async (cb: any) =>
      cb({
        comments: {
          create: jest.fn().mockResolvedValue({
            id_comment: 5,
            id_post: 1,
            id_user: 2,
            content: 'hello',
            created_at: new Date(),
          }),
        },
        posts: {
          update: jest.fn().mockResolvedValue({ comments_count: 10 }),
        },
      })
    );
    const service = new CommentService(prismaMock as any);

    const result = await service.createComment({ postId: 1, userId: 2, content: ' hello ' });

    expect(result.id).toBe(5);
    expect(result.content).toBe('hello');
    expect(result.author).toEqual({ id: 2, username: 'user_2', avatarUrl: null });
  });

  it('updateComment: validation edge-case для пустого content', async () => {
    const service = new CommentService(prismaMock as any);

    await expect(service.updateComment(1, 1, { content: '   ' })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('getCommentById: бросает CommentNotFoundError', async () => {
    prismaMock.comments.findUnique.mockResolvedValue(null);
    const service = new CommentService(prismaMock as any);

    await expect(service.getCommentById(111)).rejects.toBeInstanceOf(CommentNotFoundError);
  });
});
