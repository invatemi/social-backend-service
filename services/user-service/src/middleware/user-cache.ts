import { cache } from './redis';
import { getConfig } from '../config/env';
import { getPaginationCacheSuffix, PaginationParams } from '../utils/pagination';

export const getUserCacheTtlSeconds = (): number => getConfig().userCacheTtlSeconds;
export const getUserListCacheTtlSeconds = (): number => getConfig().userListCacheTtlSeconds;

const listKey = (baseKey: string, pagination: PaginationParams): string =>
  `${baseKey}:${getPaginationCacheSuffix(pagination)}`;

const searchKey = (query: string, pagination: PaginationParams): string =>
  `users:search:${encodeURIComponent(query.toLowerCase())}:${getPaginationCacheSuffix(pagination)}`;

export const userCacheKeys = {
  byId: (userId: number) => `user:${userId}`,
  followers: (userId: number, pagination: PaginationParams) =>
    listKey(`user:${userId}:followers`, pagination),
  following: (userId: number, pagination: PaginationParams) =>
    listKey(`user:${userId}:following`, pagination),
  followCounts: (userId: number) => `user:${userId}:follow-counts`,
  isFollowing: (followerId: number, followingId: number) =>
    `user:${followerId}:following:${followingId}`,
  friends: (userId: number, pagination: PaginationParams) =>
    listKey(`user:${userId}:friends`, pagination),
  friendsCount: (userId: number) => `user:${userId}:friends-count`,
  incomingRequests: (userId: number, pagination: PaginationParams) =>
    listKey(`user:${userId}:friend-requests:incoming`, pagination),
  outgoingRequests: (userId: number, pagination: PaginationParams) =>
    listKey(`user:${userId}:friend-requests:outgoing`, pagination),
  friendship: (userId1: number, userId2: number) => {
    const [firstId, secondId] = [userId1, userId2].sort((a, b) => a - b);
    return `user:${firstId}:friendship:${secondId}`;
  },
  relation: (viewerId: number, targetId: number) => `user:${viewerId}:relation:${targetId}`,
  search: searchKey,
};

/** Invalidates cached profile and relation lists affected by a profile update. */
export const invalidateUserProfileCache = async (userId: number): Promise<void> => {
  await Promise.all([
    cache.del(userCacheKeys.byId(userId)),
    cache.delPattern('user:*:followers:*'),
    cache.delPattern('user:*:following:*'),
    cache.delPattern('user:*:friends:*'),
    cache.delPattern('users:search:*'),
  ]);
};

/** Invalidates cached follow lists and counters for two users. */
export const invalidateFollowCaches = async (
  followerId: number,
  followingId: number
): Promise<void> => {
  await Promise.all([
    cache.delPattern(`user:${followerId}:following:*`),
    cache.delPattern(`user:${followingId}:followers:*`),
    cache.delMany([
      userCacheKeys.followCounts(followerId),
      userCacheKeys.followCounts(followingId),
      userCacheKeys.isFollowing(followerId, followingId),
      userCacheKeys.relation(followerId, followingId),
      userCacheKeys.relation(followingId, followerId),
    ]),
  ]);
};

/** Invalidates cached friend lists, counters, requests, and relation status. */
export const invalidateFriendCaches = async (
  userId1: number,
  userId2: number
): Promise<void> => {
  await Promise.all([
    cache.delPattern(`user:${userId1}:friends:*`),
    cache.delPattern(`user:${userId2}:friends:*`),
    cache.delPattern(`user:${userId1}:friend-requests:incoming:*`),
    cache.delPattern(`user:${userId2}:friend-requests:incoming:*`),
    cache.delPattern(`user:${userId1}:friend-requests:outgoing:*`),
    cache.delPattern(`user:${userId2}:friend-requests:outgoing:*`),
    cache.delMany([
      userCacheKeys.friendsCount(userId1),
      userCacheKeys.friendsCount(userId2),
      userCacheKeys.friendship(userId1, userId2),
      userCacheKeys.relation(userId1, userId2),
      userCacheKeys.relation(userId2, userId1),
    ]),
  ]);
};
