/**
 * Branded type.
 *
 * A branded id is a string at runtime, but a separate type at compile time: the
 * symbol below exists only in the type world, so nothing can produce one by
 * accident. A plain string is never assignable to it, and neither is an id
 * carrying a different brand — a GameId cannot be passed where a GenreId is
 * expected.
 */
declare const brand: unique symbol

export type Brand<T, B extends string> = T & { readonly [brand]: B }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (raw: string): boolean => UUID_PATTERN.test(raw)
