import { fetchPostAudienceUserIds } from '../clients/user-client';
import { publishSocketEventToMany } from '../routes/notifications/socket-hub';

/** Notifies the post audience about feed changes. */
export const dispatchPostFeedEvent = async (
  event: 'post:created' | 'post:updated',
  data: {
    postId: number;
    userId: number;
    title?: string | null;
    content?: string;
    imageUrl?: string | null;
    isPublished?: boolean;
    likesCount?: number;
    commentsCount?: number;
    timestamp: string;
  }
): Promise<void> => {
  const recipientIds = await fetchPostAudienceUserIds(data.userId);

  publishSocketEventToMany(recipientIds, event, {
    id: data.postId,
    postId: data.postId,
    userId: data.userId,
    title: data.title ?? null,
    content: data.content ?? '',
    imageUrl: data.imageUrl ?? null,
    isPublished: data.isPublished,
    likesCount: data.likesCount ?? 0,
    commentsCount: data.commentsCount ?? 0,
    createdAt: data.timestamp,
  });
};

/** Notifies the post audience that a post was deleted. */
export const dispatchPostDeletedEvent = async (data: {
  postId: number;
  userId: number;
  timestamp: string;
}): Promise<void> => {
  const recipientIds = await fetchPostAudienceUserIds(data.userId);
  publishSocketEventToMany(recipientIds, 'post:deleted', {
    postId: data.postId,
  });
};

/** Notifies the post audience about comment activity. */
export const dispatchCommentEvent = async (
  event: 'comment:created' | 'comment:deleted',
  data: {
    commentId: number;
    postId: number;
    userId: number;
    postAuthorId: number;
    content?: string;
    commentsCount: number;
    timestamp: string;
  }
): Promise<void> => {
  const audienceIds = await fetchPostAudienceUserIds(data.postAuthorId);
  const recipientIds = [...new Set([...audienceIds, data.userId])];

  publishSocketEventToMany(recipientIds, event, {
    id: data.commentId,
    commentId: data.commentId,
    postId: data.postId,
    deletedBy: data.userId,
    content: data.content,
    commentsCount: data.commentsCount,
    createdAt: data.timestamp,
    author: { id: data.userId },
  });
};

/** Notifies the post audience about like changes. */
export const dispatchPostLikedEvent = async (
  data: {
    postId: number;
    likesCount: number;
    liked: boolean;
    userId: number;
    postAuthorId: number;
  }
): Promise<void> => {
  const audienceIds = await fetchPostAudienceUserIds(data.postAuthorId);
  const recipientIds = [...new Set([...audienceIds, data.userId])];

  publishSocketEventToMany(recipientIds, 'post:liked', data);
};
