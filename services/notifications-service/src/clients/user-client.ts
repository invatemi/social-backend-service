const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://social-user-service:3002';
const USER_SERVICE_TIMEOUT_MS = Number(process.env.USER_SERVICE_TIMEOUT_MS ?? 3000);

type FollowersResponse = {
  followers?: Array<{ id: number }>;
};

/** Returns follower user IDs for a given user (for post feed fan-out). */
export const fetchFollowerIds = async (userId: number): Promise<number[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USER_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${USER_SERVICE_URL}/api/followers/${userId}/followers?limit=100`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as FollowersResponse;
    return (data.followers ?? []).map((follower) => follower.id);
  } catch (error) {
    console.log('[UserClient] Failed to fetch followers:', error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
};
