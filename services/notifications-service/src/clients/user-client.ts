const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://social-user-service:3002';
const USER_SERVICE_TIMEOUT_MS = Number(process.env.USER_SERVICE_TIMEOUT_MS ?? 3000);

type AudienceResponse = {
  userIds?: number[];
};

/** Returns user IDs that should receive realtime updates for an author's posts. */
export const fetchPostAudienceUserIds = async (authorId: number): Promise<number[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USER_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${USER_SERVICE_URL}/api/users/internal/post-audience`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: authorId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return [authorId];
    }

    const data = (await response.json()) as AudienceResponse;
    const userIds = [...new Set((data.userIds ?? []).filter((id) => Number.isInteger(id) && id > 0))];

    return userIds.length > 0 ? userIds : [authorId];
  } catch (error) {
    console.log('[UserClient] Failed to fetch post audience:', error);
    return [authorId];
  } finally {
    clearTimeout(timeout);
  }
};
