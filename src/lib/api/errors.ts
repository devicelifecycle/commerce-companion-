/**
 * Centralized API error handling.
 * All Supabase errors are normalized through here so callers get consistent
 * error messages regardless of which table or operation failed.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly context?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function assertNoError(
  error: { message: string } | null | undefined,
  context: string,
): void {
  if (error) throw new ApiError(`${context}: ${error.message}`, context, error);
}

export function handleApiError(error: unknown, fallback: string): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Error) throw new ApiError(error.message, fallback, error);
  throw new ApiError(fallback, fallback, error);
}
