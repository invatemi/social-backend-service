export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

export interface PaginationParams {
  limit: number;
  cursor?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

export class PaginationValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'PaginationValidationError';
  }
}

const parsePositiveInteger = (
  value: unknown,
  field: string,
  options: { required?: boolean } = {}
): number | undefined => {
  if (value === undefined || value === null || value === '') {
    if (options.required) {
      throw new PaginationValidationError(`${field} is required`, field);
    }
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new PaginationValidationError(`Invalid ${field}`, field);
  }

  return parsed;
};

export const parsePaginationQuery = (query: {
  limit?: unknown;
  cursor?: unknown;
}): PaginationParams => {
  const requestedLimit = parsePositiveInteger(query.limit, 'limit') ?? DEFAULT_PAGE_LIMIT;
  const cursor = parsePositiveInteger(query.cursor, 'cursor');

  return {
    limit: Math.min(requestedLimit, MAX_PAGE_LIMIT),
    ...(cursor ? { cursor } : {}),
  };
};

export const getPaginationCacheSuffix = ({ limit, cursor }: PaginationParams): string =>
  `limit:${limit}:cursor:${cursor ?? 'first'}`;

export const splitPage = <T>(
  rows: T[],
  limit: number,
  getCursor: (row: T) => number
): PaginatedResult<T> => {
  const pageItems = rows.slice(0, limit);
  const extraItem = rows[limit];

  return {
    items: pageItems,
    nextCursor: extraItem ? String(getCursor(extraItem)) : null,
  };
};
