import { ProfileService } from '../../src/routes/profile/profile.service';
import { ValidationError } from '../../src/routes/followers/followers.errors';
import { cache } from '../../src/middleware/redis';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    minSearchQueryLength: 2,
    maxAuthorsBatchSize: 50,
    s3Bucket: 'b',
    s3PublicBaseUrl: 'https://cdn.example.com',
    s3UploadEndpoint: '',
    s3UploadUrlTtlSeconds: 300,
    s3Region: 'ru-1',
    s3ForcePathStyle: true,
    s3AccessKeyId: 'a',
    s3SecretAccessKey: 'b',
  }),
}));

jest.mock('../../src/middleware/redis', () => ({
  cache: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../../src/middleware/user-cache', () => ({
  userCacheKeys: {
    byId: (id: number) => `user:${id}`,
    search: () => 'search:key',
  },
  invalidateUserProfileCache: jest.fn(),
  getUserCacheTtlSeconds: () => 60,
  getUserListCacheTtlSeconds: () => 60,
}));

jest.mock('../../src/middleware/event-bus', () => ({
  eventBus: { publish: jest.fn() },
}));

describe('ProfileService unit', () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    follow: { count: jest.fn(), findMany: jest.fn() },
    friendship: { count: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getProfile: возвращает профиль из кэша', async () => {
    (cache.get as jest.Mock).mockResolvedValue({ id: 1, name: 'john' });
    const service = new ProfileService(prismaMock as any);

    const result = await service.getProfile(1);

    expect(result).toEqual({ id: 1, name: 'john' });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('updateProfile: бросает ValidationError если payload пустой', async () => {
    const service = new ProfileService(prismaMock as any);

    await expect(service.updateProfile(1, {})).rejects.toBeInstanceOf(ValidationError);
  });
});
