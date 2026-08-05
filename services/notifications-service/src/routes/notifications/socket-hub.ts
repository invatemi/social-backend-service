import http from 'http';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, Socket } from 'socket.io';
import { getConfig } from '../../config/env';
import { verifyUserJwt } from '../../../shared/security/verify-user-jwt.js';

const PRESENCE_CHECK_MAX_IDS = 100;
const PRESENCE_WATCHER_TTL_MS = 15 * 60 * 1000;
const ONLINE_USERS_KEY = 'socket:online_users';

const onlineUsers = new Map<number, number>();
/** targetUserId -> Map(watcherUserId -> lastSeenMs) */
const presenceWatchers = new Map<number, Map<number, number>>();
let io: Server | null = null;
let redisPub: ReturnType<typeof createClient> | null = null;
let redisSub: ReturnType<typeof createClient> | null = null;

const userRoom = (userId: number): string => `user:${userId}`;
const chatRoom = (chatId: number): string => `chat:${chatId}`;

const setUserOnline = async (userId: number): Promise<void> => {
  onlineUsers.set(userId, (onlineUsers.get(userId) ?? 0) + 1);
  if (redisPub?.isOpen) {
    try {
      await redisPub.sAdd(ONLINE_USERS_KEY, String(userId));
    } catch {
      // presence redis is best-effort
    }
  }
};

const setUserOffline = async (userId: number): Promise<void> => {
  const connections = onlineUsers.get(userId) ?? 0;
  if (connections <= 1) {
    onlineUsers.delete(userId);
    if (redisPub?.isOpen) {
      try {
        await redisPub.sRem(ONLINE_USERS_KEY, String(userId));
      } catch {
        // presence redis is best-effort
      }
    }
    return;
  }

  onlineUsers.set(userId, connections - 1);
};

const isUserOnline = async (userId: number): Promise<boolean> => {
  if (onlineUsers.has(userId)) return true;
  if (redisPub?.isOpen) {
    try {
      return (await redisPub.sIsMember(ONLINE_USERS_KEY, String(userId))) === 1;
    } catch {
      return false;
    }
  }
  return false;
};

const pruneWatchers = (now: number): void => {
  for (const [targetId, watchers] of presenceWatchers) {
    for (const [watcherId, ts] of watchers) {
      if (now - ts > PRESENCE_WATCHER_TTL_MS) {
        watchers.delete(watcherId);
      }
    }
    if (watchers.size === 0) {
      presenceWatchers.delete(targetId);
    }
  }
};

const registerPresenceWatchers = (watcherId: number, targetIds: number[]): void => {
  const now = Date.now();
  pruneWatchers(now);
  for (const targetId of targetIds) {
    if (targetId === watcherId) continue;
    let watchers = presenceWatchers.get(targetId);
    if (!watchers) {
      watchers = new Map();
      presenceWatchers.set(targetId, watchers);
    }
    watchers.set(watcherId, now);
  }
};

const notifyPresenceWatchers = (
  targetUserId: number,
  event: 'user:online' | 'user:offline'
): void => {
  const watchers = presenceWatchers.get(targetUserId);
  if (!watchers || watchers.size === 0) return;
  const now = Date.now();
  const recipientIds: number[] = [];
  for (const [watcherId, ts] of watchers) {
    if (now - ts > PRESENCE_WATCHER_TTL_MS) {
      watchers.delete(watcherId);
      continue;
    }
    recipientIds.push(watcherId);
  }
  if (watchers.size === 0) {
    presenceWatchers.delete(targetUserId);
  }
  publishSocketEventToMany(recipientIds, event, { userId: targetUserId });
};

const resolveToken = (socket: Socket): string | null => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }

  const authHeader = socket.handshake.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
};

const verifySocketToken = (token: string): { userId: number; role?: string } | null => {
  const config = getConfig();
  try {
    const payload = verifyUserJwt(token, {
      getJwtSecret: () => config.jwtSecret,
      clockToleranceSec: config.jwtClockToleranceSec,
      expectedIssuer: config.jwtIssuer,
      expectedAudience: config.jwtAudience,
      claimsStrict: config.jwtClaimsStrict,
    });

    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
};

/** Sends a typed socket event to all active sessions of one user. */
export const publishSocketEvent = (userId: number, event: string, data: unknown): void => {
  io?.to(userRoom(userId)).emit(event, data);
};

/** Sends a typed socket event to multiple users. */
export const publishSocketEventToMany = (
  userIds: number[],
  event: string,
  data: unknown
): void => {
  const uniqueIds = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  for (const userId of uniqueIds) {
    publishSocketEvent(userId, event, data);
  }
};

/** Broadcasts a socket event to all connected users except one optional user. */
export const broadcastSocketEvent = (
  event: string,
  data: unknown,
  excludeUserId?: number
): void => {
  if (!io) {
    return;
  }

  if (excludeUserId) {
    io.except(userRoom(excludeUserId)).emit(event, data);
    return;
  }

  io.emit(event, data);
};

/** Pushes a typed socket event derived from a persisted notification. */
export const publishNotificationToUser = (
  userId: number,
  event: string,
  data: unknown
): void => {
  publishSocketEvent(userId, event, data);
};

const attachRedisAdapter = async (serverIo: Server): Promise<void> => {
  const redisUrl = getConfig().redisUrl;
  if (!redisUrl) {
    console.log('[Socket] REDIS_URL not set — running without Redis adapter');
    return;
  }

  redisPub = createClient({ url: redisUrl });
  redisSub = redisPub.duplicate();
  redisPub.on('error', (error) => console.log('[Socket Redis] pub error:', error));
  redisSub.on('error', (error) => console.log('[Socket Redis] sub error:', error));

  await Promise.all([redisPub.connect(), redisSub.connect()]);
  serverIo.adapter(createAdapter(redisPub, redisSub));
  console.log('[Socket] Redis adapter attached');
};

/** Attaches socket.io to the HTTP server and registers connection handlers. */
export const initSocketHub = (server: http.Server): Server => {
  const corsOrigin = getConfig().socketCorsOrigin;

  io = new Server(server, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  void attachRedisAdapter(io).catch((error) => {
    console.log('[Socket] Failed to attach Redis adapter:', error);
  });

  io.use((socket, next) => {
    const token = resolveToken(socket);
    if (!token) {
      next(new Error('Unauthorized: Missing token'));
      return;
    }

    const payload = verifySocketToken(token);
    if (!payload) {
      next(new Error('Unauthorized: Invalid or expired token'));
      return;
    }

    socket.data.userId = payload.userId;
    socket.data.role = payload.role;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as number;
    socket.join(userRoom(userId));

    void (async () => {
      const wasOffline = !(await isUserOnline(userId));
      await setUserOnline(userId);
      if (wasOffline) {
        notifyPresenceWatchers(userId, 'user:online');
      }
    })();

    socket.on('chat:join', (chatId: unknown) => {
      const id = Number(chatId);
      if (Number.isInteger(id) && id > 0) {
        socket.join(chatRoom(id));
      }
    });

    socket.on('chat:leave', (chatId: unknown) => {
      const id = Number(chatId);
      if (Number.isInteger(id) && id > 0) {
        socket.leave(chatRoom(id));
      }
    });

    socket.on('presence:check', (payload: unknown) => {
      void (async () => {
        const rawIds = Array.isArray(payload)
          ? payload
          : payload && typeof payload === 'object' && Array.isArray((payload as { userIds?: unknown }).userIds)
            ? (payload as { userIds: unknown[] }).userIds
            : [];

        const statuses: Record<string, boolean> = {};
        const targetIds: number[] = [];
        for (const value of rawIds) {
          if (targetIds.length >= PRESENCE_CHECK_MAX_IDS) break;
          const id = Number(value);
          if (Number.isInteger(id) && id > 0) {
            statuses[String(id)] = await isUserOnline(id);
            targetIds.push(id);
          }
        }

        registerPresenceWatchers(userId, targetIds);
        socket.emit('presence:status', { statuses });
      })();
    });

    socket.on('disconnect', () => {
      void (async () => {
        const wasOnline = await isUserOnline(userId);
        await setUserOffline(userId);
        if (wasOnline && !(await isUserOnline(userId))) {
          notifyPresenceWatchers(userId, 'user:offline');
        }
      })();
    });
  });

  console.log('Socket.io hub is ready');
  return io;
};
