/**
 * Machine-readable error codes raised by this library.
 */
export type ErrorCode = "UnknownCurrency" | "ParseError" | "FetchError" | "InvalidDate" | "InvalidAmount";

/**
 * The single error class thrown by every throwing function in this library.
 * Use the `code` property to branch on the failure reason.
 */
export class CnbRatesError extends Error {
  readonly code: ErrorCode;
  /** HTTP status for `FetchError` responses; `undefined` for network failures. */
  readonly status: number | undefined;

  constructor(code: ErrorCode, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = "CnbRatesError";
    this.code = code;
    this.status = options.status;
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

/** Result object returned by every `try*` function. Never throws. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: CnbRatesError };

/** Narrowing helper: `true` when `err` is a {@link CnbRatesError}. */
export function isCnbRatesError(err: unknown): err is CnbRatesError {
  return err instanceof CnbRatesError;
}

/** @internal */
export function fail(code: ErrorCode, message: string, options?: { status?: number; cause?: unknown }): never {
  throw new CnbRatesError(code, message, options);
}

/** @internal Wraps a throwing function into a `Result`. */
export function attempt<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (err instanceof CnbRatesError) return { ok: false, error: err };
    throw err;
  }
}

/** @internal Async variant of {@link attempt}. */
export async function attemptAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof CnbRatesError) return { ok: false, error: err };
    throw err;
  }
}
