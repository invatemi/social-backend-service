type UserSummary = {
  id: number;
  name: string;
  avatarUrl?: string | null;
};

type SseEvent = {
  event: string;
  data: unknown;
};

const mapUser = (user: UserSummary) => ({
  id: user.id,
  username: user.name,
  avatarUrl: user.avatarUrl ?? null,
});

/** Maps a persisted notification to a typed SSE event for the frontend. */
export const mapNotificationToSseEvent = (notification: {
  id: number;
  type: string;
  createdAt: Date;
  payload: unknown;
}): SseEvent | null => {
  const payload = (notification.payload ?? {}) as Record<string, unknown>;

  switch (notification.type) {
    case 'FRIEND_REQUESTED': {
      const fromUser = payload.fromUser as UserSummary | undefined;
      const toUser = payload.toUser as UserSummary | undefined;
      if (!fromUser || !toUser) return null;

      return {
        event: 'notification:friend_request',
        data: {
          id: notification.id,
          type: 'friend_request',
          fromUser: mapUser(fromUser),
          toUser: { id: toUser.id },
          createdAt: notification.createdAt.toISOString(),
          status: 'pending',
        },
      };
    }

    case 'FRIEND_ACCEPTED': {
      const fromUser = payload.fromUser as UserSummary | undefined;
      const toUser = payload.toUser as UserSummary | undefined;
      if (!fromUser || !toUser) return null;

      return {
        event: 'notification:friend_accepted',
        data: {
          id: notification.id,
          type: 'friend_accepted',
          fromUser: mapUser(fromUser),
          toUser: { id: toUser.id },
          createdAt: notification.createdAt.toISOString(),
          status: 'accepted',
        },
      };
    }

    case 'FRIEND_REMOVED': {
      const initiatorUser = payload.initiatorUser as UserSummary | undefined;
      const targetUser = payload.targetUser as UserSummary | undefined;
      if (!initiatorUser || !targetUser) return null;

      return {
        event: 'notification:friend_updated',
        data: {
          id: notification.id,
          type: 'friend_removed',
          fromUser: { id: initiatorUser.id },
          toUser: { id: targetUser.id },
          createdAt: notification.createdAt.toISOString(),
        },
      };
    }

    case 'FOLLOW_CREATED':
    case 'FOLLOW_DELETED': {
      const followerUser = payload.followerUser as UserSummary | undefined;
      const followingUser = payload.followingUser as UserSummary | undefined;
      if (!followerUser || !followingUser) return null;

      return {
        event: 'notification:follow_updated',
        data: {
          id: notification.id,
          type: notification.type === 'FOLLOW_CREATED' ? 'follow_created' : 'follow_deleted',
          fromUser: { id: followerUser.id },
          toUser: { id: followingUser.id },
          createdAt: notification.createdAt.toISOString(),
        },
      };
    }

    case 'USER_UPDATED': {
      const user = payload.user as UserSummary | undefined;
      if (!user) return null;

      return {
        event: 'user:profile_updated',
        data: {
          userId: user.id,
          username: user.name,
          avatarUrl: user.avatarUrl ?? null,
          changedFields: payload.changedFields ?? [],
          createdAt: notification.createdAt.toISOString(),
        },
      };
    }

    default:
      return null;
  }
};

/** Maps ephemeral friend status changes to SSE events. */
export const mapFriendStatusToSseEvent = (
  type: 'friend_request_cancelled' | 'friend_declined',
  data: {
    requestId: number;
    fromUser: UserSummary;
    toUser: UserSummary;
  }
): SseEvent => ({
  event: 'notification:friend_updated',
  data: {
    id: data.requestId,
    type,
    fromUser: { id: data.fromUser.id },
    toUser: { id: data.toUser.id },
    createdAt: new Date().toISOString(),
  },
});
