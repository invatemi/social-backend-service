import { cache } from './redis';

export const USER_CACHE_TTL_SECONDS = Number(process.env.USER_CACHE_TTL_SECONDS ?? 300);
export const USER_LIST_CACHE_TTL_SECONDS = Number(process.env.USER_LIST_CACHE_TTL_SECONDS ?? 60);

export const userCacheKeys = {
  byId: (userId: number) => `user:${userId}`,
  followers: (userId: number) => `user:${userId}:followers`,
  following: (userId: number) => `user:${userId}:following`,
  followCounts: (userId: number) => `user:${userId}:follow-counts`,
  isFollowing: (followerId: number, followingId: number) =>
    `user:${followerId}:following:${followingId}`,
  friends: (userId: number) => `user:${userId}:friends`,
  friendsCount: (userId: number) => `user:${userId}:friends-count`,
  incomingRequests: (userId: number) => `user:${userId}:friend-requests:incoming`,
  outgoingRequests: (userId: number) => `user:${userId}:friend-requests:outgoing`,
  friendship: (userId1: number, userId2: number) => {
    const [firstId, secondId] = [userId1, userId2].sort((a, b) => a - b);
    return `user:${firstId}:friendship:${secondId}`;
  },
};

export const invalidateUserProfileCache = async (userId: number): Promise<void> => {
  await Promise.all([
    cache.del(userCacheKeys.byId(userId)),
    cache.delPattern('user:*:followers'),
    cache.delPattern('user:*:following'),
    cache.delPattern('user:*:friends'),
  ]);
};

export const invalidateFollowCaches = async (
  followerId: number,
  followingId: number
): Promise<void> => {
  await cache.delMany([
    userCacheKeys.following(followerId),
    userCacheKeys.followers(followingId),
    userCacheKeys.followCounts(followerId),
    userCacheKeys.followCounts(followingId),
    userCacheKeys.isFollowing(followerId, followingId),
  ]);
};

export const invalidateFriendCaches = async (
  userId1: number,
  userId2: number
): Promise<void> => {
  await cache.delMany([
    userCacheKeys.friends(userId1),
    userCacheKeys.friends(userId2),
    userCacheKeys.friendsCount(userId1),
    userCacheKeys.friendsCount(userId2),
    userCacheKeys.incomingRequests(userId1),
    userCacheKeys.incomingRequests(userId2),
    userCacheKeys.outgoingRequests(userId1),
    userCacheKeys.outgoingRequests(userId2),
    userCacheKeys.friendship(userId1, userId2),
  ]);
};
