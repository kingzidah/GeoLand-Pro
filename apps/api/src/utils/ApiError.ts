/**
 * Operational errors — thrown deliberately and handled by the global error handler.
 * Non-operational errors (programming bugs) should never extend this class.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: Record<string, unknown> | unknown[];

  constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    errors?: Record<string, unknown> | unknown[]
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  // ─── Factory helpers ──────────────────────────────────────────────────────

  static badRequest(message: string, errors?: Record<string, unknown> | unknown[]): ApiError {
    return new ApiError(400, message, true, errors);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(resource: string): ApiError {
    return new ApiError(404, `${resource} not found`);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = 'Too many requests — please try again later'): ApiError {
    return new ApiError(429, message);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable'): ApiError {
    return new ApiError(503, message);
  }

  static internal(message = 'An unexpected error occurred'): ApiError {
    return new ApiError(500, message, false);
  }
}
