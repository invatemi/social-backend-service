import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { serviceTokenService } from './service-token.service';

const router = Router();

const tokenRequestSchema = z
  .object({
    client_id: z.string().trim().min(1),
    client_secret: z.string().min(1),
    audience: z.string().trim().min(1),
  })
  .strict();

router.post('/token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = tokenRequestSchema.parse(req.body);
    const token = serviceTokenService.issueToken({
      clientId: body.client_id,
      clientSecret: body.client_secret,
      audience: body.audience,
    });

    res.status(200).json(token);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Validation error', errors: error.issues });
      return;
    }

    if (error instanceof Error) {
      if (error.message === 'INVALID_CLIENT_CREDENTIALS') {
        res.status(401).json({ success: false, message: 'Unauthorized: invalid client credentials' });
        return;
      }
      if (error.message === 'INVALID_AUDIENCE') {
        res.status(403).json({ success: false, message: 'Forbidden: audience not allowed for client' });
        return;
      }
    }

    next(error);
  }
});

export default router;
