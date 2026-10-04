import { ERROR_CODES, isOneOf, type ErrorCode } from '@ch4se/contracts';

export class ApiError extends Error {
  override name = 'ApiError';
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  VALIDATION_ERROR: 400,
  UPSTREAM_UNAVAILABLE: 502,
  NO_OPEN_INCIDENTS: 404,
  UNAUTHORIZED: 401,
};

/** Reducers fail with "<CODE>: <message>"; anything else is an upstream fault. */
export function fromReducerError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const text = error instanceof Error ? error.message : String(error);
  const match = /^([A-Z_]+): ([\s\S]*)$/.exec(text);
  if (match && isOneOf(ERROR_CODES, match[1])) return new ApiError(match[1], match[2]!);
  return new ApiError('UPSTREAM_UNAVAILABLE', `SpacetimeDB: ${text}`);
}
