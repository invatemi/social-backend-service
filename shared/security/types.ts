import { Request } from 'express';

export type UserRole = 'admin' | 'moderator' | 'user' | 'guest';

export interface UserJwtPayload {
  userId: number;
  email?: string;
  role?: UserRole | string;
  typ?: string;
  iat?: number;
  exp?: number;
}

export interface ServiceJwtPayload {
  typ: 'service';
  iss: string;
  sub: string;
  aud: string;
  scope: string[];
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: { userId: number; role?: string };
  service?: { id: string; scopes: string[] };
}
