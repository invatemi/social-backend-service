import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma';
import { krakendAuthMiddleware, type KrakenDRequest } from '../../middleware';
import { MessageService, parsePagination } from './message.service';

const router = Router();

const createChatSchema = z.object({
  participantIds: z.array(z.number().int().positive()).min(1),
  isGroup: z.boolean().optional(),
  chatName: z.string().trim().max(150).optional(),
});

const attachmentSchema = z.object({
  url: z.string().url().max(1000),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(127),
  sizeBytes: z.number().int().positive(),
  objectKey: z.string().trim().min(1).max(512),
});

const sendMessageSchema = z
  .object({
    chatId: z.number().int().positive(),
    content: z.string().max(4000).optional().default(''),
    attachments: z.array(attachmentSchema).max(5).optional(),
  })
  .refine(
    (body) => Boolean(body.content?.trim()) || (body.attachments?.length ?? 0) > 0,
    { message: 'Message content or attachments are required', path: ['content'] }
  );

const uploadUrlQuerySchema = z.object({
  contentType: z.string().trim().min(1).max(127).optional(),
  fileName: z.string().trim().min(1).max(255).optional(),
  sizeBytes: z.coerce.number().int().positive().optional(),
});

const attachmentsQuerySchema = z.object({
  kind: z.enum(['image', 'file']).optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

const getPrisma = (req: KrakenDRequest): PrismaClient => (req as any).prisma as PrismaClient;

const parseChatId = (raw: string): number | null => {
  const chatId = Number.parseInt(raw, 10);
  if (!Number.isInteger(chatId) || chatId <= 0) return null;
  return chatId;
};

router.get('/chats', krakendAuthMiddleware, async (req: KrakenDRequest, res, next) => {
  try {
    const service = new MessageService(getPrisma(req));
    const { limit, offset } = parsePagination(req.query as { limit?: string; offset?: string });
    const result = await service.listChats(req.user!.userId, limit, offset);
    res.status(200).json({
      message: 'Chats fetched',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/chats', krakendAuthMiddleware, async (req: KrakenDRequest, res, next) => {
  try {
    const body = createChatSchema.parse(req.body);
    const service = new MessageService(getPrisma(req));
    const chat = await service.createChat({
      userId: req.user!.userId,
      participantIds: body.participantIds,
      isGroup: body.isGroup,
      chatName: body.chatName,
    });
    res.status(200).json(chat);
  } catch (error) {
    next(error);
  }
});

router.delete('/chats/:chatId', krakendAuthMiddleware, async (req: KrakenDRequest, res, next) => {
  try {
    const chatId = parseChatId(String(req.params.chatId));
    if (!chatId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid chat id', field: 'chatId' },
      });
      return;
    }

    const service = new MessageService(getPrisma(req));
    const result = await service.deleteChat(chatId, req.user!.userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get(
  '/chats/:chatId/upload-url',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res, next) => {
    try {
      const chatId = parseChatId(String(req.params.chatId));
      if (!chatId) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid chat id', field: 'chatId' },
        });
        return;
      }

      const query = uploadUrlQuerySchema.parse(req.query);
      const service = new MessageService(getPrisma(req));
      const result = await service.getUploadUrl(chatId, req.user!.userId, query);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/chats/:chatId/attachments',
  krakendAuthMiddleware,
  async (req: KrakenDRequest, res, next) => {
    try {
      const chatId = parseChatId(String(req.params.chatId));
      if (!chatId) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid chat id', field: 'chatId' },
        });
        return;
      }

      const query = attachmentsQuerySchema.parse(req.query);
      const { limit, offset } = parsePagination({
        limit: query.limit,
        offset: query.offset,
      });
      const service = new MessageService(getPrisma(req));
      const result = await service.listAttachments(
        chatId,
        req.user!.userId,
        query.kind,
        limit,
        offset
      );
      res.status(200).json({
        message: 'Attachments fetched',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/send', krakendAuthMiddleware, async (req: KrakenDRequest, res, next) => {
  try {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issue?.message ?? 'Invalid request data',
          field: issue?.path?.join('.') || null,
        },
      });
      return;
    }
    const body = parsed.data;
    const service = new MessageService(getPrisma(req));
    const message = await service.sendMessage({
      userId: req.user!.userId,
      chatId: body.chatId,
      content: body.content ?? '',
      attachments: body.attachments,
    });
    res.status(200).json(message);
  } catch (error) {
    next(error);
  }
});

router.get('/:chatId', krakendAuthMiddleware, async (req: KrakenDRequest, res, next) => {
  try {
    const chatId = parseChatId(String(req.params.chatId));
    if (!chatId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid chat id', field: 'chatId' },
      });
      return;
    }

    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1),
      100
    );
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;

    const service = new MessageService(getPrisma(req));
    const result = await service.listMessages(chatId, req.user!.userId, limit, before);
    res.status(200).json({
      message: 'Messages fetched',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
