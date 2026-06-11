import { getConfig } from '../config/env';

/** HTTP-клиент для запросов к user-service. */
export class UserClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    const config = getConfig();
    this.baseUrl = config.userServiceUrl;
    this.timeoutMs = config.userServiceTimeoutMs;
  }

  /** Возвращает ID пользователей для realtime-аудитории поста. */
  async fetchPostAudienceUserIds(userId: number): Promise<number[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/users/internal/post-audience`, {
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
export const fetchPostAudienceUserIds = (authorId: number) =>
  userClient.fetchPostAudienceUserIds(authorId);
