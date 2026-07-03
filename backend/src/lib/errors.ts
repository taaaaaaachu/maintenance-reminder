export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(message = "Not Found"): HttpError {
  return new HttpError(404, "NOT_FOUND", message);
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, "BAD_REQUEST", message);
}

export function unauthorized(message = "Unauthorized"): HttpError {
  return new HttpError(401, "UNAUTHORIZED", message);
}
