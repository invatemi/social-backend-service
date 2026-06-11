import { getConfig } from '../config/env';

export interface PostAuthor {
  id: number;
  username: string;
  avatarUrl: string | null;
}

/** HTTP-клиент для запросов к user-service. */
export class UserClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  /** Читает URL и таймаут из переменных окружения. */
  constructor() {
    const config = getConfig();
    this.baseUrl = config.userServiceUrl;
    this.timeoutMs = config.userServiceTimeoutMs;
  }

  /** Возвращает заглушку автора при недоступности user-service. */
  private fallbackAuthor(userId: number): PostAuthor {
    return { id: userId, username: `user_${userId}`, avatarUrl: null };
  }

  /** Загружает данные авторов по списку ID. */
  async fetchAuthorsByIds(userIds: number[]): Promise<Map<number, PostAuthor>> {
    const uniqueIds = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
    const authorsMap = new Map<number, PostAuthor>();
    if (uniqueIds.length === 0) return authorsMap;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/users/internal/authors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: uniqueIds }),
        signal: controller.signal,
      });

      if (!response.ok) {
        uniqueIds.forEach((id) => authorsMap.set(id, this.fallbackAuthor(id)));
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
          authorsMap.set(id, this.fallbackAuthor(id));
        }
      });
    } catch {
      uniqueIds.forEach((id) => authorsMap.set(id, this.fallbackAuthor(id)));
    } finally {
      clearTimeout(timeout);
    }

    return authorsMap;
  }

  /** Возвращает ID пользователей для формирования ленты. */
  async fetchFeedSourceUserIds(userId: number): Promise<number[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/users/internal/feed-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
        signal: controller.signal,
      });

      if (!response.ok) return [];

      const data = (await response.json()) as { userIds?: number[] };
      return [...new Set((data.userIds ?? []).filter((id) => Number.isInteger(id) && id > 0))];
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const userClient = new UserClient();
export const fetchAuthorsByIds = (ids: number[]) => userClient.fetchAuthorsByIds(ids);
export const fetchFeedSourceUserIds = (userId: number) => userClient.fetchFeedSourceUserIds(userId);
