import express from 'express';
import request from 'supertest';
import postRoutes from '../../src/routes/post/endpoints';
import commentRoutes from '../../src/routes/comment/endpoints';
import { errorHandler } from '../../src/middleware/error-handler';
import { PostNotFoundError } from '../../src/routes/post/post.errors';
import { testAuthHeader } from '../helpers/auth';

const createPostMock = jest.fn();
const getAllPostsMock = jest.fn();
const toggleLikeMock = jest.fn();
const createCommentMock = jest.fn();

jest.mock('../../src/routes/post/post.service', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: createPostMock,
    getAllPosts: getAllPostsMock,
    toggleLike: toggleLikeMock,
  })),
}));

jest.mock('../../src/routes/comment/comment.service', () => ({
  CommentService: jest.fn().mockImplementation(() => ({
    createComment: createCommentMock,
  })),
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).prisma = {};
    next();
  });
  app.use('/api/posts', postRoutes);
  app.use('/api/comments', commentRoutes);
  app.use(errorHandler);
  return app;
};

describe('Post/Comment endpoints integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/posts: happy path', async () => {
    createPostMock.mockResolvedValue({ id: 1, userId: 7, content: 'c' });
    const app = buildApp();

    const response = await request(app)
      .post('/api/posts')
      .set('Authorization', testAuthHeader(7))
      .send({ content: 'c' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(createPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
      })
    );
  });

  it('POST /api/posts/:id/like -> 404 при отсутствии поста', async () => {
    toggleLikeMock.mockRejectedValue(new PostNotFoundError(12));
    const app = buildApp();

    const response = await request(app)
      .post('/api/posts/12/like')
      .set('Authorization', testAuthHeader(3));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('POST_NOT_FOUND');
  });

  it('POST /api/comments: happy path', async () => {
    createCommentMock.mockResolvedValue({ id: 10, postId: 1, userId: 3, content: 'hello' });
    const app = buildApp();

    const response = await request(app)
      .post('/api/comments')
      .set('Authorization', testAuthHeader(3))
      .send({ postId: 1, content: 'hello' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(createCommentMock).toHaveBeenCalledWith({ postId: 1, userId: 3, content: 'hello' });
  });

  it('POST /api/posts without token -> 401', async () => {
    const app = buildApp();
    const response = await request(app).post('/api/posts').send({ content: 'x' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
