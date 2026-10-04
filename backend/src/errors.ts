/** Operational HTTP error safe to expose through the API error boundary. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: unknown,
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message);
}
