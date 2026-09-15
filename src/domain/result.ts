/**
 * Result is a discriminated union used instead of exceptions.
 *
 * The compiler cannot see that a function throws, so a thrown error is invisible
 * to the type system. A returned Result is not: the caller has to check `ok`
 * before it can touch `value`, and skipping the check is a compile error.
 */

export type Ok<T> = { readonly ok: true; readonly value: T }

export type Err<E> = { readonly ok: false; readonly error: E }

export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })

export const err = <E>(error: E): Err<E> => ({ ok: false, error })
