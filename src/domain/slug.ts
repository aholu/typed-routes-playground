import { err, ok, type Result } from './result.js'
import type { ApiError } from './errors.js'

/**
 * Slug rules shared by every model that has one. A slug ends up in URLs, so it
 * is derived from the name only on create and afterwards changes on request.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const validateSlug = (raw: unknown): Result<string, ApiError> =>
  typeof raw === 'string' && SLUG_PATTERN.test(raw)
    ? ok(raw)
    : err({
        kind: 'invalid_input',
        field: 'slug',
        message: 'expected lowercase latin letters and digits joined by "-"',
      })

/** 'Open World' -> 'open-world', 'Pokémon' -> 'pokemon'. Letters outside latin are dropped, so it can return ''. */
export const slugify = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * The slug of a new entity: validated when the body has one, derived from the
 * already validated name when it does not.
 */
export const resolveSlug = (body: Record<string, unknown>, name: string): Result<string, ApiError> => {
  if ('slug' in body) return validateSlug(body.slug)

  const slug = slugify(name)
  return slug.length > 0
    ? ok(slug)
    : err({ kind: 'invalid_input', field: 'slug', message: 'cannot be derived from name, provide one explicitly' })
}
