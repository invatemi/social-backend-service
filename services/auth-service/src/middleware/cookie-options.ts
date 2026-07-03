import { CookieOptions, Request, Response } from 'express';
import { getConfig } from '../config/env';

const parseSameSite = (value: string): CookieOptions['sameSite'] => {
  const normalized = value.toLowerCase();
  if (normalized === 'strict' || normalized === 'lax' || normalized === 'none') {
    return normalized;
  }
  throw new Error('REFRESH_COOKIE_SAME_SITE must be strict, lax, or none');
};

export const getRefreshCookieOptions = (): CookieOptions => {
  const config = getConfig();
  const maxAgeDays = config.refreshCookieMaxAgeDays;

  return {
    httpOnly: true,
    secure: config.refreshCookieSecure,
    sameSite: parseSameSite(config.refreshCookieSameSite),
    path: config.refreshCookiePath,
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  };
};

export const setRefreshCookie = (res: Response, refreshToken: string): void => {
  const config = getConfig();
  res.cookie(config.refreshCookieName, refreshToken, getRefreshCookieOptions());
};

export const clearRefreshCookie = (res: Response): void => {
  const config = getConfig();
  res.clearCookie(config.refreshCookieName, {
    httpOnly: true,
    secure: config.refreshCookieSecure,
    sameSite: parseSameSite(config.refreshCookieSameSite),
    path: config.refreshCookiePath,
  });
};

export const getRefreshTokenFromRequest = (req: Request): string | undefined => {
  const config = getConfig();
  const cookieValue = req.cookies?.[config.refreshCookieName];
  return typeof cookieValue === 'string' && cookieValue.length > 0 ? cookieValue : undefined;
};
