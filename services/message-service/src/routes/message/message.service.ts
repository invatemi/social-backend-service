import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  PrismaClient,
  Chat,
  ChatParticipant,
  Message,
  MessageAttachment,
} from '../../generated/prisma';
import { Prisma } from '../../generated/prisma';
import { getConfig } from '../../config/env';
import { fetchAuthorsByIds, type UserAuthor } from '../../clients';
import { eventBus } from '../../middleware/event-bus';
import {
  ChatNotFoundError,
  MessageForbiddenError,
  MessageNotFoundError,
  MessageValidationError,
} from './message.errors';

/** Debounce chat.read fan-out per (chatId, userId). */
const CHAT_READ_THROTTLE_MS = 3000;
const chatReadPublishAt = new Map<string, number>();

const shouldPublishChatRead = (chatId: number, userId: number): boolean => {
  const key = `${chatId}:${userId}`;
  const now = Date.now();
  const last = chatReadPublishAt.get(key) ?? 0;
  if (now - last < CHAT_READ_THROTTLE_MS) {
    return false;
  }
  chatReadPublishAt.set(key, now);

  // Bound map growth
  if (chatReadPublishAt.size > 10_000) {
    const cutoff = now - CHAT_READ_THROTTLE_MS * 2;
    for (const [entryKey, ts] of chatReadPublishAt) {
      if (ts < cutoff) chatReadPublishAt.delete(entryKey);
    }
  }
  return true;
};

export type MessageAuthorDto = {
  id: number;
  username: string;
  avatarUrl: string | null;
};

export type AttachmentKind = 'image' | 'file';

export type MessageAttachmentData = {
  id: number;
  messageId: number;
  chatId: number;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  objectKey: string;
  createdAt: string;
};

export type MessageReplyPreview = {
  id: number;
  content: string;
  createdAt: string;
  author: MessageAuthorDto;
};

export type MessageData = {
  id: number;
  chatId: number;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  forwardedFromId?: number | null;
  replyToId?: number | null;
  replyTo?: MessageReplyPreview | null;
  isRead?: boolean;
  author: MessageAuthorDto;
  attachments: MessageAttachmentData[];
};

export type ChatData = {
  chatId: number;
  chatName: string | null;
  isGroup: boolean;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  unreadCount: number;
  lastMessage: {
    content: string;
    createdAt: string;
    author: MessageAuthorDto;
  } | null;
  participant?: {
    userId: number;
    username: string;
    avatarUrl: string | null;
    isOnline: boolean;
  };
};

export type AttachmentInput = {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  objectKey: string;
};

export type MessageUploadUrlData = {
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  headers: { 'Content-Type': string };
  expiresIn: number;
  key: string;
};

const MAX_FILE_NAME_LENGTH = 255;

const toIso = (date: Date | null | undefined): string | null =>
  date ? date.toISOString() : null;

const authorFromMap = (id: number, authors: Map<number, UserAuthor>): MessageAuthorDto => {
  const author = authors.get(id);
  return {
    id,
    username: author?.username ?? `user_${id}`,
    avatarUrl: author?.avatarUrl ?? null,
  };
};

const sanitizeFileName = (fileName: string | undefined): string => {
  const sanitized = String(fileName ?? 'file')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

  return sanitized || 'file';
};

const joinPublicUrl = (baseUrl: string, key: string): string => {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`;
};

const resolveUploadEndpoint = (publicBaseUrl: string, uploadEndpoint: string): string => {
  if (uploadEndpoint) {
    return uploadEndpoint;
  }
  return new URL(publicBaseUrl).origin;
};

const createS3Client = (forBrowserUpload = false): S3Client => {
  const {
    s3Endpoint,
    s3PublicBaseUrl,
    s3UploadEndpoint,
    s3Region,
    s3ForcePathStyle,
    s3AccessKeyId,
    s3SecretAccessKey,
  } = getConfig();

  const endpoint = forBrowserUpload
    ? resolveUploadEndpoint(s3PublicBaseUrl, s3UploadEndpoint)
    : s3Endpoint || resolveUploadEndpoint(s3PublicBaseUrl, s3UploadEndpoint);

  return new S3Client({
    region: s3Region,
    endpoint,
    forcePathStyle: s3ForcePathStyle,
    credentials: {
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
    },
  });
};

const kindFromMime = (mimeType: string): AttachmentKind =>
  mimeType.startsWith('image/') ? 'image' : 'file';

const formatAttachment = (row: MessageAttachment): MessageAttachmentData => ({
  id: row.id,
  messageId: row.messageId,
  chatId: row.chatId,
  kind: row.kind === 'image' ? 'image' : 'file',
  fileName: row.fileName,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  url: row.url,
  objectKey: row.objectKey,
  createdAt: row.createdAt.toISOString(),
});

const previewContent = (content: string, attachments: MessageAttachment[]): string => {
  const trimmed = content.trim();
  if (trimmed) return trimmed;
  if (attachments.length === 0) return '';
  const first = attachments[0];
  if (first.kind === 'image') {
    return attachments.length > 1 ? `Фото (${attachments.length})` : 'Фото';
  }
  return first.fileName || 'Файл';
};

/** Сервис чатов и сообщений. */
export class MessageService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertParticipant(chatId: number, userId: number): Promise<ChatParticipant> {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!participant) {
      throw new MessageForbiddenError('You are not a participant of this chat');
    }
    return participant;
  }

  private async findExistingDm(userId: number, otherUserId: number): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<Array<{ chat_id: number }>>`
      SELECT cp1.chat_id
      FROM chat_participants cp1
      INNER JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id
      INNER JOIN chats c ON c.id = cp1.chat_id
      WHERE c.is_group = false
        AND cp1.user_id = ${userId}
        AND cp2.user_id = ${otherUserId}
      LIMIT 1
    `;
    return rows[0]?.chat_id ?? null;
  }

  private async formatChat(
    chat: Chat & { participants: ChatParticipant[] },
    currentUserId: number,
    authors: Map<number, UserAuthor>,
    lastMessage: (Message & { attachments?: MessageAttachment[] }) | null,
    unreadCount: number
  ): Promise<ChatData> {
    const myParticipation = chat.participants.find((p) => p.userId === currentUserId);
    const other = chat.participants.find((p) => p.userId !== currentUserId);

    return {
      chatId: chat.id,
      chatName: chat.chatName,
      isGroup: chat.isGroup,
      lastMessageAt: toIso(chat.lastMessageAt),
      lastReadAt: toIso(myParticipation?.lastReadAt),
      unreadCount,
      lastMessage: lastMessage
        ? {
            content: previewContent(lastMessage.content, lastMessage.attachments ?? []),
            createdAt: lastMessage.createdAt.toISOString(),
            author: authorFromMap(lastMessage.authorId, authors),
          }
        : null,
      participant: other
        ? {
            userId: other.userId,
            username: authorFromMap(other.userId, authors).username,
            avatarUrl: authorFromMap(other.userId, authors).avatarUrl,
            isOnline: false,
          }
        : undefined,
    };
  }

  private validateAttachmentInput(
    chatId: number,
    attachment: AttachmentInput,
    index: number
  ): { kind: AttachmentKind; fileName: string; mimeType: string; sizeBytes: number; url: string; objectKey: string } {
    const config = getConfig();
    const field = `attachments[${index}]`;
    const mimeType = String(attachment.mimeType ?? '').trim().toLowerCase();
    const fileName = String(attachment.fileName ?? '').trim().slice(0, MAX_FILE_NAME_LENGTH);
    const objectKey = String(attachment.objectKey ?? '').trim();
    const url = String(attachment.url ?? '').trim();
    const sizeBytes = Number(attachment.sizeBytes);

    if (!mimeType) {
      throw new MessageValidationError('Attachment mimeType is required', `${field}.mimeType`);
    }
    if (!fileName) {
      throw new MessageValidationError('Attachment fileName is required', `${field}.fileName`);
    }
    if (!objectKey) {
      throw new MessageValidationError('Attachment objectKey is required', `${field}.objectKey`);
    }
    if (!url) {
      throw new MessageValidationError('Attachment url is required', `${field}.url`);
    }
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new MessageValidationError('Attachment sizeBytes must be a positive integer', `${field}.sizeBytes`);
    }
    if (sizeBytes > config.maxAttachmentBytes) {
      throw new MessageValidationError(
        `Attachment exceeds max size of ${config.maxAttachmentBytes} bytes`,
        `${field}.sizeBytes`
      );
    }

    const expectedPrefix = `messages/${chatId}/`;
    if (!objectKey.startsWith(expectedPrefix)) {
      throw new MessageValidationError(
        `Attachment objectKey must start with ${expectedPrefix}`,
        `${field}.objectKey`
      );
    }

    const { s3PublicBaseUrl } = config;
    const base = s3PublicBaseUrl.replace(/\/+$/, '');
    if (!url.startsWith(`${base}/`)) {
      throw new MessageValidationError('Attachment url must be in configured storage', `${field}.url`);
    }

    return {
      kind: kindFromMime(mimeType),
      fileName,
      mimeType,
      sizeBytes,
      url,
      objectKey,
    };
  }

  async listChats(
    userId: number,
    limit: number,
    offset: number
  ): Promise<{ data: ChatData[]; pagination: { limit: number; offset: number } }> {
    const memberships = await this.prisma.chatParticipant.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            participants: true,
          },
        },
      },
      orderBy: {
        chat: { lastMessageAt: 'desc' },
      },
      take: limit,
      skip: offset,
    });

    const chatIds = memberships.map((m) => m.chatId);
    const lastMessages = chatIds.length
      ? await this.prisma.message.findMany({
          where: { chatId: { in: chatIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['chatId'],
          include: { attachments: true },
        })
      : [];
    const lastByChat = new Map(lastMessages.map((m) => [m.chatId, m]));

    const allUserIds = new Set<number>();
    for (const m of memberships) {
      for (const p of m.chat.participants) {
        allUserIds.add(p.userId);
      }
      const last = lastByChat.get(m.chatId);
      if (last) allUserIds.add(last.authorId);
    }
    const authors = await fetchAuthorsByIds([...allUserIds]);

    const unreadByChat = new Map<number, number>();
    if (chatIds.length > 0) {
      const unreadRows = await this.prisma.$queryRaw<
        Array<{ chat_id: number; unread_count: bigint }>
      >`
        SELECT m.chat_id, COUNT(*)::bigint AS unread_count
        FROM messages m
        INNER JOIN chat_participants cp
          ON cp.chat_id = m.chat_id AND cp.user_id = ${userId}
        WHERE m.chat_id IN (${Prisma.join(chatIds)})
          AND m.author_id <> ${userId}
          AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
        GROUP BY m.chat_id
      `;
      for (const row of unreadRows) {
        unreadByChat.set(Number(row.chat_id), Number(row.unread_count));
      }
    }

    const data: ChatData[] = [];
    for (const membership of memberships) {
      const last = lastByChat.get(membership.chatId) ?? null;
      const unreadCount = unreadByChat.get(membership.chatId) ?? 0;

      data.push(
        await this.formatChat(membership.chat, userId, authors, last, unreadCount)
      );
    }

    return { data, pagination: { limit, offset } };
  }

  async createChat(input: {
    userId: number;
    participantIds: number[];
    isGroup?: boolean;
    chatName?: string;
  }): Promise<ChatData> {
    const { userId, isGroup = false, chatName } = input;
    const uniqueParticipants = [
      ...new Set(
        input.participantIds
          .filter((id) => Number.isInteger(id) && id > 0)
          .concat(userId)
      ),
    ];

    if (uniqueParticipants.length < 2) {
      throw new MessageValidationError(
        'At least two participants are required',
        'participantIds'
      );
    }

    if (!isGroup && uniqueParticipants.length !== 2) {
      throw new MessageValidationError(
        'Direct chat must have exactly two participants',
        'participantIds'
      );
    }

    if (!isGroup) {
      const otherId = uniqueParticipants.find((id) => id !== userId)!;
      const existingId = await this.findExistingDm(userId, otherId);
      if (existingId) {
        const existing = await this.getChatData(existingId, userId);
        return existing;
      }
    }

    const chat = await this.prisma.chat.create({
      data: {
        isGroup,
        chatName: chatName?.trim() || null,
        participants: {
          create: uniqueParticipants.map((participantId) => ({
            userId: participantId,
          })),
        },
      },
      include: { participants: true },
    });

    const authors = await fetchAuthorsByIds(uniqueParticipants);
    const chatData = await this.formatChat(chat, userId, authors, null, 0);

    try {
      await eventBus.publish('chat.created', {
        chatId: chat.id,
        participantIds: uniqueParticipants,
        chatName: chat.chatName,
        isGroup: chat.isGroup,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.log('[EventBus] Failed to publish chat.created:', error);
    }

    return chatData;
  }

  async deleteChat(chatId: number, userId: number): Promise<{ message: string; status: string }> {
    await this.assertParticipant(chatId, userId);

    const participants = await this.prisma.chatParticipant.findMany({
      where: { chatId },
    });
    const participantIds = participants.map((p) => p.userId);

    await this.prisma.chat.delete({ where: { id: chatId } });

    try {
      await eventBus.publish('chat.deleted', {
        chatId,
        participantIds,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.log('[EventBus] Failed to publish chat.deleted:', error);
    }

    return { message: 'Chat deleted', status: 'ok' };
  }

  async getChatData(chatId: number, userId: number): Promise<ChatData> {
    await this.assertParticipant(chatId, userId);

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: true },
    });
    if (!chat) {
      throw new ChatNotFoundError();
    }

    const last = await this.prisma.message.findFirst({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      include: { attachments: true },
    });

    const membership = chat.participants.find((p) => p.userId === userId)!;
    const unreadCount = await this.prisma.message.count({
      where: {
        chatId,
        authorId: { not: userId },
        ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
      },
    });

    const authors = await fetchAuthorsByIds([
      ...chat.participants.map((p) => p.userId),
      ...(last ? [last.authorId] : []),
    ]);

    return this.formatChat(chat, userId, authors, last, unreadCount);
  }

  async listMessages(
    chatId: number,
    userId: number,
    limit: number,
    before?: string
  ): Promise<{ data: MessageData[]; pagination: { limit: number; offset: number } }> {
    await this.assertParticipant(chatId, userId);

    const beforeDate = before ? new Date(before) : null;
    if (before && Number.isNaN(beforeDate?.getTime())) {
      throw new MessageValidationError('Invalid before cursor', 'before');
    }

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        attachments: { orderBy: { id: 'asc' } },
        replyTo: true,
      },
    });

    // Mark as read when opening/fetching the latest page (no before cursor)
    if (!before) {
      const lastReadAt = new Date();
      await this.prisma.chatParticipant.update({
        where: { chatId_userId: { chatId, userId } },
        data: { lastReadAt },
      });

      if (shouldPublishChatRead(chatId, userId)) {
        const participantIds = (
          await this.prisma.chatParticipant.findMany({
            where: { chatId },
            select: { userId: true },
          })
        ).map((p) => p.userId);

        const notifyIds = participantIds.filter((id) => id !== userId);
        if (notifyIds.length > 0) {
          try {
            await eventBus.publish('chat.read', {
              chatId,
              readerId: userId,
              lastReadAt: lastReadAt.toISOString(),
              participantIds: notifyIds,
              timestamp: lastReadAt.toISOString(),
            });
          } catch (error) {
            console.log('[EventBus] Failed to publish chat.read:', error);
          }
        }
      }
    }

    const participants = await this.prisma.chatParticipant.findMany({ where: { chatId } });
    const other = participants.find((p) => p.userId !== userId);
    const otherLastRead = other?.lastReadAt ?? null;

    const authorIds = [
      ...new Set([
        ...messages.map((m) => m.authorId),
        ...messages.flatMap((m) => (m.replyTo ? [m.replyTo.authorId] : [])),
      ]),
    ];
    const authors = await fetchAuthorsByIds(authorIds);

    const data = messages
      .slice()
      .reverse()
      .map((msg) => this.toMessageData(msg, authors, {
        isRead:
          msg.authorId === userId
            ? otherLastRead != null && msg.createdAt <= otherLastRead
            : true,
      }));

    return { data, pagination: { limit, offset: 0 } };
  }

  private toMessageData(
    msg: Message & {
      attachments: MessageAttachment[];
      replyTo?: Message | null;
    },
    authors: Map<number, UserAuthor>,
    extras: { isRead?: boolean } = {}
  ): MessageData {
    return {
      id: msg.id,
      chatId: msg.chatId,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
      forwardedFromId: msg.forwardedFromId ?? null,
      replyToId: msg.replyToId ?? null,
      replyTo: msg.replyTo
        ? {
            id: msg.replyTo.id,
            content: msg.replyTo.content,
            createdAt: msg.replyTo.createdAt.toISOString(),
            author: authorFromMap(msg.replyTo.authorId, authors),
          }
        : null,
      isRead: extras.isRead,
      author: authorFromMap(msg.authorId, authors),
      attachments: msg.attachments.map(formatAttachment),
    };
  }

  private async getOwnedMessage(
    messageId: number,
    userId: number
  ): Promise<Message & { attachments: MessageAttachment[] }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: { orderBy: { id: 'asc' } } },
    });
    if (!message) {
      throw new MessageNotFoundError();
    }
    await this.assertParticipant(message.chatId, userId);
    if (message.authorId !== userId) {
      throw new MessageForbiddenError('Only the author can modify this message');
    }
    return message;
  }

  private async publishMessageDeleted(
    messageId: number,
    chatId: number,
    participantIds: number[]
  ): Promise<void> {
    try {
      await eventBus.publish('message.deleted', {
        id: messageId,
        chatId,
        participantIds,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.log('[EventBus] Failed to publish message.deleted:', error);
    }
  }

  private async refreshChatLastMessageAt(chatId: number): Promise<void> {
    const latest = await this.prisma.message.findFirst({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    await this.prisma.chat.update({
      where: { id: chatId },
      data: { lastMessageAt: latest?.createdAt ?? null },
    });
  }

  async editMessage(
    messageId: number,
    userId: number,
    input: {
      content?: string;
      removeAttachmentIds?: number[];
      attachments?: AttachmentInput[];
    }
  ): Promise<MessageData> {
    const config = getConfig();
    const existing = await this.getOwnedMessage(messageId, userId);

    const removeIds = [...new Set(input.removeAttachmentIds ?? [])];
    const newAttachments = (input.attachments ?? []).map((a, i) =>
      this.validateAttachmentInput(existing.chatId, a, i)
    );

    if (removeIds.length > 0) {
      const ownedIds = new Set(existing.attachments.map((a) => a.id));
      const invalid = removeIds.filter((id) => !ownedIds.has(id));
      if (invalid.length > 0) {
        throw new MessageValidationError(
          'Cannot remove attachments that do not belong to this message',
          'removeAttachmentIds'
        );
      }
    }

    const remainingCount =
      existing.attachments.length - removeIds.length + newAttachments.length;
    if (remainingCount > config.maxAttachmentsPerMessage) {
      throw new MessageValidationError(
        `Message can have at most ${config.maxAttachmentsPerMessage} attachments`,
        'attachments'
      );
    }
    if (remainingCount < 0) {
      throw new MessageValidationError('Invalid attachment removal', 'removeAttachmentIds');
    }

    const nextContent =
      input.content !== undefined ? input.content.trim() : existing.content.trim();
    if (nextContent.length > 4000) {
      throw new MessageValidationError('Message is too long', 'content');
    }
    if (!nextContent && remainingCount === 0) {
      throw new MessageValidationError(
        'Message content or attachments are required',
        'content'
      );
    }

    const editedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      if (removeIds.length > 0) {
        await tx.messageAttachment.deleteMany({
          where: { messageId, id: { in: removeIds } },
        });
      }

      if (newAttachments.length > 0) {
        await tx.messageAttachment.createMany({
          data: newAttachments.map((a) => ({
            messageId,
            chatId: existing.chatId,
            kind: a.kind,
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            url: a.url,
            objectKey: a.objectKey,
          })),
        });
      }

      return tx.message.update({
        where: { id: messageId },
        data: {
          content: nextContent,
          editedAt,
        },
        include: { attachments: { orderBy: { id: 'asc' } } },
      });
    });

    const participants = await this.prisma.chatParticipant.findMany({
      where: { chatId: updated.chatId },
    });
    const participantIds = participants.map((p) => p.userId);
    const authors = await fetchAuthorsByIds([userId]);
    const dto = this.toMessageData(updated, authors);

    try {
      await eventBus.publish('message.updated', {
        ...dto,
        participantIds,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.log('[EventBus] Failed to publish message.updated:', error);
    }

    return dto;
  }

  async deleteMessage(
    messageId: number,
    userId: number
  ): Promise<{ message: string; status: string; id: number; chatId: number }> {
    const existing = await this.getOwnedMessage(messageId, userId);
    const chatId = existing.chatId;

    const participants = await this.prisma.chatParticipant.findMany({
      where: { chatId },
    });
    const participantIds = participants.map((p) => p.userId);

    await this.prisma.message.delete({ where: { id: messageId } });
    await this.refreshChatLastMessageAt(chatId);
    await this.publishMessageDeleted(messageId, chatId, participantIds);

    return { message: 'Message deleted', status: 'ok', id: messageId, chatId };
  }

  async deleteMessagesBulk(
    messageIds: number[],
    userId: number
  ): Promise<{ message: string; status: string; deletedIds: number[] }> {
    const uniqueIds = [...new Set(messageIds)];
    if (uniqueIds.length === 0) {
      throw new MessageValidationError('messageIds is required', 'messageIds');
    }
    if (uniqueIds.length > 100) {
      throw new MessageValidationError('At most 100 messages can be deleted', 'messageIds');
    }

    const messages = await this.prisma.message.findMany({
      where: { id: { in: uniqueIds } },
      include: { attachments: true },
    });
    if (messages.length !== uniqueIds.length) {
      throw new MessageNotFoundError('One or more messages were not found');
    }

    const chatIds = [...new Set(messages.map((m) => m.chatId))];
    for (const chatId of chatIds) {
      await this.assertParticipant(chatId, userId);
    }
    for (const msg of messages) {
      if (msg.authorId !== userId) {
        throw new MessageForbiddenError('Only the author can delete these messages');
      }
    }

    const participantsByChat = new Map<number, number[]>();
    for (const chatId of chatIds) {
      const participants = await this.prisma.chatParticipant.findMany({
        where: { chatId },
        select: { userId: true },
      });
      participantsByChat.set(
        chatId,
        participants.map((p) => p.userId)
      );
    }

    await this.prisma.message.deleteMany({ where: { id: { in: uniqueIds } } });
    for (const chatId of chatIds) {
      await this.refreshChatLastMessageAt(chatId);
    }

    for (const msg of messages) {
      await this.publishMessageDeleted(
        msg.id,
        msg.chatId,
        participantsByChat.get(msg.chatId) ?? []
      );
    }

    return {
      message: 'Messages deleted',
      status: 'ok',
      deletedIds: uniqueIds,
    };
  }

  async forwardMessages(input: {
    userId: number;
    messageIds: number[];
    targetChatIds: number[];
  }): Promise<{ message: string; data: MessageData[] }> {
    const uniqueMessageIds = [...new Set(input.messageIds)];
    const uniqueTargetChatIds = [...new Set(input.targetChatIds)];

    if (uniqueMessageIds.length === 0) {
      throw new MessageValidationError('messageIds is required', 'messageIds');
    }
    if (uniqueTargetChatIds.length === 0) {
      throw new MessageValidationError('targetChatIds is required', 'targetChatIds');
    }
    if (uniqueMessageIds.length > 50) {
      throw new MessageValidationError('At most 50 messages can be forwarded', 'messageIds');
    }
    if (uniqueTargetChatIds.length > 20) {
      throw new MessageValidationError('At most 20 target chats allowed', 'targetChatIds');
    }

    const sources = await this.prisma.message.findMany({
      where: { id: { in: uniqueMessageIds } },
      include: { attachments: { orderBy: { id: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    if (sources.length !== uniqueMessageIds.length) {
      throw new MessageNotFoundError('One or more messages were not found');
    }

    const sourceChatIds = [...new Set(sources.map((m) => m.chatId))];
    for (const chatId of sourceChatIds) {
      await this.assertParticipant(chatId, input.userId);
    }
    for (const chatId of uniqueTargetChatIds) {
      await this.assertParticipant(chatId, input.userId);
    }

    const config = getConfig();
    const createdMessages: Array<Message & { attachments: MessageAttachment[] }> = [];

    for (const targetChatId of uniqueTargetChatIds) {
      for (const source of sources) {
        if (source.attachments.length > config.maxAttachmentsPerMessage) {
          throw new MessageValidationError(
            `At most ${config.maxAttachmentsPerMessage} attachments allowed`,
            'attachments'
          );
        }

        const created = await this.prisma.$transaction(async (tx) => {
          const message = await tx.message.create({
            data: {
              chatId: targetChatId,
              authorId: input.userId,
              content: source.content,
              forwardedFromId: source.id,
              attachments:
                source.attachments.length > 0
                  ? {
                      create: source.attachments.map((a) => ({
                        chatId: targetChatId,
                        kind: a.kind,
                        fileName: a.fileName,
                        mimeType: a.mimeType,
                        sizeBytes: a.sizeBytes,
                        url: a.url,
                        objectKey: a.objectKey,
                      })),
                    }
                  : undefined,
            },
            include: { attachments: { orderBy: { id: 'asc' } } },
          });

          await tx.chat.update({
            where: { id: targetChatId },
            data: { lastMessageAt: message.createdAt },
          });

          await tx.chatParticipant.update({
            where: {
              chatId_userId: { chatId: targetChatId, userId: input.userId },
            },
            data: { lastReadAt: message.createdAt },
          });

          return message;
        });

        createdMessages.push(created);
      }
    }

    const authors = await fetchAuthorsByIds([input.userId]);
    const data: MessageData[] = [];

    for (const message of createdMessages) {
      const participantIds = (
        await this.prisma.chatParticipant.findMany({
          where: { chatId: message.chatId },
          select: { userId: true },
        })
      ).map((p) => p.userId);

      const dto = this.toMessageData(message, authors, { isRead: false });
      data.push(dto);

      try {
        await eventBus.publish('message.created', {
          ...dto,
          participantIds,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.log('[EventBus] Failed to publish message.created:', error);
      }
    }

    return { message: 'Messages forwarded', data };
  }

  async getUploadUrl(
    chatId: number,
    userId: number,
    input: { contentType?: string; fileName?: string; sizeBytes?: number }
  ): Promise<MessageUploadUrlData> {
    await this.assertParticipant(chatId, userId);

    const config = getConfig();
    const contentType = (input.contentType ?? 'application/octet-stream').trim().toLowerCase();
    if (!contentType || contentType.length > 127) {
      throw new MessageValidationError('Invalid content type', 'contentType');
    }

    if (input.sizeBytes != null) {
      const size = Number(input.sizeBytes);
      if (!Number.isInteger(size) || size <= 0) {
        throw new MessageValidationError('sizeBytes must be a positive integer', 'sizeBytes');
      }
      if (size > config.maxAttachmentBytes) {
        throw new MessageValidationError(
          `File exceeds max size of ${config.maxAttachmentBytes} bytes`,
          'sizeBytes'
        );
      }
    }

    const key = `messages/${chatId}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
    const client = createS3Client(true);
    const command = new PutObjectCommand({
      Bucket: config.s3Bucket,
      ContentType: contentType,
      Key: key,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: config.s3UploadUrlTtlSeconds,
      signableHeaders: new Set(['content-type']),
    });

    return {
      uploadUrl,
      publicUrl: joinPublicUrl(config.s3PublicBaseUrl, key),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresIn: config.s3UploadUrlTtlSeconds,
      key,
    };
  }

  async listAttachments(
    chatId: number,
    userId: number,
    kind: AttachmentKind | undefined,
    limit: number,
    offset: number
  ): Promise<{ data: MessageAttachmentData[]; pagination: { limit: number; offset: number } }> {
    await this.assertParticipant(chatId, userId);

    const rows = await this.prisma.messageAttachment.findMany({
      where: {
        chatId,
        ...(kind ? { kind } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return {
      data: rows.map(formatAttachment),
      pagination: { limit, offset },
    };
  }

  async sendMessage(input: {
    userId: number;
    chatId: number;
    content: string;
    attachments?: AttachmentInput[];
    replyToId?: number;
  }): Promise<MessageData> {
    const content = input.content.trim();
    const attachments = input.attachments ?? [];
    const config = getConfig();

    if (!content && attachments.length === 0) {
      throw new MessageValidationError('Message content or attachments are required', 'content');
    }
    if (content.length > 4000) {
      throw new MessageValidationError('Message is too long', 'content');
    }
    if (attachments.length > config.maxAttachmentsPerMessage) {
      throw new MessageValidationError(
        `At most ${config.maxAttachmentsPerMessage} attachments allowed`,
        'attachments'
      );
    }

    await this.assertParticipant(input.chatId, input.userId);

    let replyToId: number | undefined;
    if (input.replyToId != null) {
      const replySource = await this.prisma.message.findUnique({
        where: { id: input.replyToId },
      });
      if (!replySource || replySource.chatId !== input.chatId) {
        throw new MessageValidationError('Reply target message not found in this chat', 'replyToId');
      }
      replyToId = replySource.id;
    }

    const validated = attachments.map((a, i) => this.validateAttachmentInput(input.chatId, a, i));

    const participants = await this.prisma.chatParticipant.findMany({
      where: { chatId: input.chatId },
    });
    const participantIds = participants.map((p) => p.userId);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          chatId: input.chatId,
          authorId: input.userId,
          content,
          replyToId,
          attachments:
            validated.length > 0
              ? {
                  create: validated.map((a) => ({
                    chatId: input.chatId,
                    kind: a.kind,
                    fileName: a.fileName,
                    mimeType: a.mimeType,
                    sizeBytes: a.sizeBytes,
                    url: a.url,
                    objectKey: a.objectKey,
                  })),
                }
              : undefined,
        },
        include: {
          attachments: { orderBy: { id: 'asc' } },
          replyTo: true,
        },
      });

      await tx.chat.update({
        where: { id: input.chatId },
        data: { lastMessageAt: created.createdAt },
      });

      await tx.chatParticipant.update({
        where: { chatId_userId: { chatId: input.chatId, userId: input.userId } },
        data: { lastReadAt: created.createdAt },
      });

      return created;
    });

    const authorIds = [
      input.userId,
      ...(message.replyTo ? [message.replyTo.authorId] : []),
    ];
    const authors = await fetchAuthorsByIds(authorIds);
    const dto = this.toMessageData(message, authors, { isRead: false });

    try {
      await eventBus.publish('message.created', {
        ...dto,
        participantIds,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.log('[EventBus] Failed to publish message.created:', error);
    }

    return dto;
  }
}

export const parsePagination = (query: {
  limit?: string;
  offset?: string;
}): { limit: number; offset: number } => {
  const config = getConfig();
  const limit = Math.min(
    Math.max(Number.parseInt(query.limit ?? String(config.defaultPageSize), 10) || config.defaultPageSize, 1),
    100
  );
  const offset = Math.max(Number.parseInt(query.offset ?? '0', 10) || 0, 0);
  return { limit, offset };
};
