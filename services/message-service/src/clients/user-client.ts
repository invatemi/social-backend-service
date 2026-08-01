import { getConfig } from '../config/env';
import { getInternalAuthHeader, getServiceTokenClient } from './service-token-client';

export interface UserAuthor {
  id: number;
  username: string;
  avatarUrl: string | null;
}

/** HTTP-клиент для запросов к user-service. */
export class UserClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    const config = getConfig();
    this.baseUrl = config.userServiceUrl;
    this.timeoutMs = config.userServiceTimeoutMs;
  }

  private fallbackAuthor(userId: number): UserAuthor {
    return { id: userId, username: `user_${userId}`, avatarUrl: null };
  }

  async fetchAuthorsByIds(userIds: number[]): Promise<Map<number, UserAuthor>> {
    const uniqueIds = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
    const authorsMap = new Map<number, UserAuthor>();
    if (uniqueIds.length === 0) return authorsMap;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const authorization = await getInternalAuthHeader();
      const response = await fetch(`${this.baseUrl}/api/users/internal/authors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
        },
        body: JSON.stringify({ userIds: uniqueIds }),
        signal: controller.signal,
      });

      if (response.status === 401) {
        getServiceTokenClient().clearCache();
      }

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
}

export const userClient = new UserClient();
export const fetchAuthorsByIds = (ids: number[]) => userClient.fetchAuthorsByIds(ids);
