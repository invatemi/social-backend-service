export interface PostAuthor {
  id: number;
  username: string;
  avatarUrl: string | null;
}

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://social-user-service:3002';
const USER_SERVICE_TIMEOUT_MS = Number(process.env.USER_SERVICE_TIMEOUT_MS ?? 3000);

const fallbackAuthor = (userId: number): PostAuthor => ({
  id: userId,
  username: `user_${userId}`,
  avatarUrl: null,
});

export const fetchAuthorsByIds = async (userIds: number[]): Promise<Map<number, PostAuthor>> => {
  const uniqueIds = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  const authorsMap = new Map<number, PostAuthor>();

  if (uniqueIds.length === 0) {
    return authorsMap;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USER_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${USER_SERVICE_URL}/api/users/internal/authors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: uniqueIds }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.log(`[UserClient] Authors request failed with status ${response.status}`);
      uniqueIds.forEach((id) => authorsMap.set(id, fallbackAuthor(id)));
      return authorsMap;
    }

    const data = (await response.json()) as {
      authors?: Array<{ id: number; username: string; avatarUrl: string | null }>;
    };

    for (const author of data.authors ?? []) {
      authorsMap.set(author.id, author);
    }

    uniqueIds.forEach((id) => {
      if (!authorsMap.has(id)) {
        authorsMap.set(id, fallbackAuthor(id));
      }
    });
  } catch (error) {
    console.log('[UserClient] Failed to fetch authors:', error);
    uniqueIds.forEach((id) => authorsMap.set(id, fallbackAuthor(id)));
  } finally {
    clearTimeout(timeout);
  }

  return authorsMap;
};
