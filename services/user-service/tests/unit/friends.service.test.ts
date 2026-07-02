import { FriendsService } from '../../src/routes/friends/friends.service';
import { SelfFriendError, FriendRequestAlreadyExistsError } from '../../src/routes/friends/friends.errors';

jest.mock('../../src/middleware/event-bus', () => ({
  eventBus: { publish: jest.fn() },
}));

jest.mock('../../src/middleware/redis', () => ({
  cache: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../../src/middleware/user-cache', () => ({
  invalidateFollowCaches: jest.fn(),
  invalidateFriendCaches: jest.fn(),
  getUserListCacheTtlSeconds: () => 60,
  userCacheKeys: {
    friendship: () => 'f',
    relation: () => 'r',
    friendsCount: () => 'fc',
    friends: () => 'fr',
    incomingRequests: () => 'in',
    outgoingRequests: () => 'out',
  },
}));

describe('FriendsService unit', () => {
  const prismaMock = {
    user: { findUnique: jest.fn() },
    friendship: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    friendRequest: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    follow: { upsert: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sendFriendRequest: self-request -> SelfFriendError', async () => {
    const service = new FriendsService(prismaMock as any);
    await expect(service.sendFriendRequest(3, 3)).rejects.toBeInstanceOf(SelfFriendError);
  });

  it('sendFriendRequest: duplicate pending request -> FriendRequestAlreadyExistsError', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, name: 'u', email: 'u@e.com', avatarUrl: null });
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: 10,
      status: 'pending',
    });
    const service = new FriendsService(prismaMock as any);

    await expect(service.sendFriendRequest(1, 2)).rejects.toBeInstanceOf(FriendRequestAlreadyExistsError);
  });
});
