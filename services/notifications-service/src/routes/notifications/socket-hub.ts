import http from 'http';
import { Server, Socket } from 'socket.io';
import { getConfig } from '../../config/env';
import { verifyUserJwt } from '../../../shared/security/verify-user-jwt.js';

const onlineUsers = new Map<number, number>();
let io: Server | null = null;

const userRoom = (userId: number): string => `user:${userId}`;
const chatRoom = (chatId: number): string => `chat:${chatId}`;

const setUserOnline = (userId: number): void => {
  onlineUsers.set(userId, (onlineUsers.get(userId) ?? 0) + 1);
};

const setUserOffline = (userId: number): void => {
  const connections = onlineUsers.get(userId) ?? 0;
  if (connections <= 1) {
    onlineUsers.delete(userId);
    return;
  }

  onlineUsers.set(userId, connections - 1);
};

const isUserOnline = (userId: number): boolean => onlineUsers.has(userId);

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

/** Attaches socket.io to the HTTP server and registers connection handlers. */
export const initSocketHub = (server: http.Server): Server => {
  const corsOrigin = getConfig().socketCorsOrigin;

  io = new Server(server, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
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

    const wasOffline = !isUserOnline(userId);
    setUserOnline(userId);

    if (wasOffline) {
      broadcastSocketEvent('user:online', { userId }, userId);
    }

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

    socket.on('disconnect', () => {
      const wasOnline = isUserOnline(userId);
      setUserOffline(userId);

      if (wasOnline && !isUserOnline(userId)) {
        broadcastSocketEvent('user:offline', { userId });
      }
    });
  });

  console.log('Socket.io hub is ready');
  return io;
};
