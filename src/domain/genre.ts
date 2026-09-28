import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from './result.js'
import { isUuid, type Brand } from './id.js'
import { resolveSlug, validateSlug } from './slug.js'
import { asJsonObject, normalizeName, validateName } from './validation.js'
import type { ApiError } from './errors.js'

export type GenreId = Brand<string, 'GenreId'>

/** Wire format of a seed row: unbranded strings, no guarantees. */
export type GenreDto = {
  readonly uuid: string
  readonly name: string
  readonly slug: string
}

export type Genre = {
  readonly id: GenreId
  readonly name: string
  readonly slug: string
}

/** What a client sends when creating a genre. The slug may be omitted, see parseNewGenre. */
export type NewGenre = Omit<Genre, 'id'>

export type PatchGenre = Partial<NewGenre>

/**
 * The single place where a plain string becomes a GenreId. `field` names where
 * the string came from, so an id inside a body reports that body field.
 */
export const parseGenreId = (raw: string, field = 'id'): Result<GenreId, ApiError> =>
  isUuid(raw) ? ok(raw as GenreId) : err({ kind: 'invalid_input', field, message: 'expected a UUID' })

export const newGenreId = (): GenreId => {
  const id = parseGenreId(randomUUID())
  if (!id.ok) throw new Error('unreachable: randomUUID produced an invalid uuid')
  return id.value
}

export const genreFromDto = (dto: GenreDto): Result<Genre, ApiError> => {
  const id = parseGenreId(dto.uuid)
  if (!id.ok) return id

  const slug = validateSlug(dto.slug)
  if (!slug.ok) return slug

  return ok({ id: id.value, name: normalizeName(dto.name), slug: slug.value })
}

/** `slug` is optional on create: when absent it is derived from the name. */
export const parseNewGenre = (input: unknown): Result<NewGenre, ApiError> => {
  const raw = asJsonObject(input)
  if (!raw.ok) return raw

  const name = validateName(raw.value.name)
  if (!name.ok) return name

  const slug = resolveSlug(raw.value, name.value)
  if (!slug.ok) return slug

  return ok({ name: name.value, slug: slug.value })
}

/** Renaming does not touch the slug; see slug.ts. */
export const parsePatchGenre = (input: unknown): Result<PatchGenre, ApiError> => {
  const raw = asJsonObject(input)
  if (!raw.ok) return raw

  const patch: { name?: string; slug?: string } = {}

  if ('name' in raw.value) {
    const name = validateName(raw.value.name)
    if (!name.ok) return name
    patch.name = name.value
  }

  if ('slug' in raw.value) {
    const slug = validateSlug(raw.value.slug)
    if (!slug.ok) return slug
    patch.slug = slug.value
  }

  if (patch.name === undefined && patch.slug === undefined) {
    return err({ kind: 'invalid_input', field: 'body', message: 'expected at least one field to update' })
  }

  return ok(patch)
}
