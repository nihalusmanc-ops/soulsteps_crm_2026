export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 503,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
