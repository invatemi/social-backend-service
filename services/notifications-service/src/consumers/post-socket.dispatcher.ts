import { fetchFollowerIds } from '../clients/user-client';
import { publishSocketEvent, publishSocketEventToMany } from '../routes/notifications/socket-hub';

/** Notifies followers and the author about a new or updated post. */
export const dispatchPostFeedEvent = async (
  event: 'post:created' | 'post:updated' | 'post:deleted',
  data: {
    postId: number;
    userId: number;
    title?: string | null;
    content?: string;
    imageUrl?: string | null;
    isPublished?: boolean;
    timestamp: string;
  }
): Promise<void> => {
  const followerIds = await fetchFollowerIds(data.userId);
  const recipientIds = [...new Set([data.userId, ...followerIds])];

  publishSocketEventToMany(recipientIds, event, {
    id: data.postId,
    postId: data.postId,
    userId: data.userId,
    title: data.title ?? null,
    content: data.content,
    imageUrl: data.imageUrl ?? null,
    isPublished: data.isPublished,
    createdAt: data.timestamp,
  });
};

/** Notifies the post author about comment activity. */
export const dispatchCommentEvent = (
  event: 'comment:created' | 'comment:deleted',
  data: {
    commentId: number;
    postId: number;
    userId: number;
    postAuthorId: number;
    content?: string;
    timestamp: string;
  }
): void => {
  const recipients = [...new Set([data.postAuthorId, data.userId])];

  publishSocketEventToMany(recipients, event, {
    id: data.commentId,
    commentId: data.commentId,
    postId: data.postId,
    deletedBy: data.userId,
    content: data.content,
    createdAt: data.timestamp,
    author: { id: data.userId },
  });
};

/** Notifies users viewing a post about like changes (when event exists). */
export const dispatchPostLikedEvent = (
  postAuthorId: number,
  data: {
    postId: number;
    likesCount: number;
    liked: boolean;
    userId: number;
  }
): void => {
  publishSocketEvent(postAuthorId, 'post:liked', data);
};
