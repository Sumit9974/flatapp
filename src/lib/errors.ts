/** A readable message from anything thrown or returned as an error (Error, PostgrestError, AuthError). */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return String(error);
}

// Supabase results are a union of a success shape and a failure shape ({ data: null, error }),
// so these are typed on the whole result rather than on `T | null`, which would infer T as null.
interface Result {
  data: unknown;
  error: unknown;
}

/** Data from a query that must return something (lists, `.single()`); throws on error. */
export function unwrap<R extends Result>(result: R): NonNullable<R['data']> {
  if (result.error) throw result.error;
  if (result.data === null || result.data === undefined) {
    throw new Error('Nothing came back from the server. Pull down to try again.');
  }
  return result.data as NonNullable<R['data']>;
}

/** Data from `.maybeSingle()`: null means "not found" (or not visible to you). */
export function unwrapMaybe<R extends Result>(result: R): NonNullable<R['data']> | null {
  if (result.error) throw result.error;
  return (result.data ?? null) as NonNullable<R['data']> | null;
}

/** For writes that return no rows (update/insert/delete without .select()); throws on error. */
export function check(result: { error: unknown }): void {
  if (result.error) throw result.error;
}
