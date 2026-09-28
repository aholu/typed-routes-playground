import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from './result.js'
import { isUuid, type Brand } from './id.js'
import { parseGenreId, type Genre, type GenreId } from './genre.js'
import { asJsonObject, normalizeName, validateName } from './validation.js'
import type { ApiError } from './errors.js'

export type GameId = Brand<string, 'GameId'>

/**
 * Wire format: exactly what the JSON file contains, field for field.
 * snake_case, unbranded strings, no guarantees.
 */
export type GameDto = {
  readonly uuid: string
  readonly name: string
  readonly release_year: number
}

/** Domain model: the shape the rest of the code is allowed to work with. */
export type Game = {
  readonly id: GameId
  readonly name: string
  readonly releaseYear: number
  readonly genres: readonly Genre[]
}

export type GameRecord = Omit<Game, 'genres'>

/**
 * What a client sends when creating a game: its own fields, plus references to
 * existing genres instead of the genres themselves.
 */
export type NewGame = Omit<GameRecord, 'id'> & { readonly genreIds: readonly GenreId[] }

/** What a client sends when patching a game: any subset of the mutable fields. */
export type PatchGame = Partial<NewGame>

/** The single place where a plain string becomes a GameId. */
export const parseGameId = (raw: string): Result<GameId, ApiError> =>
  isUuid(raw) ? ok(raw as GameId) : err({ kind: 'invalid_input', field: 'id', message: 'expected a UUID' })

/** Wire format in, domain model out. Field renaming happens here and nowhere else. */
export const fromDto = (dto: GameDto): Result<GameRecord, ApiError> => {
  const id = parseGameId(dto.uuid)
  if (!id.ok) return id

  return ok({ id: id.value, name: normalizeName(dto.name), releaseYear: dto.release_year })
}

/** Generates a fresh id. The only caller of parseGameId that cannot fail. */
export const newGameId = (): GameId => {
  const id = parseGameId(randomUUID())
  if (!id.ok) throw new Error('unreachable: randomUUID produced an invalid uuid')
  return id.value
}

const validateReleaseYear = (raw: unknown): Result<number, ApiError> => {
  const maxYear = new Date().getFullYear() + 5
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return err({ kind: 'invalid_input', field: 'releaseYear', message: 'expected an integer' })
  }
  if (raw < 1960 || raw > maxYear) {
    return err({ kind: 'invalid_input', field: 'releaseYear', message: `expected 1960-${maxYear}` })
  }
  return ok(raw)
}

/**
 * Only checks that every entry looks like a genre id. Whether those genres
 * exist is a question for the store. Duplicates are dropped: a game either
 * has a genre or it doesn't.
 */
const validateGenreIds = (raw: unknown): Result<readonly GenreId[], ApiError> => {
  if (!Array.isArray(raw)) {
    return err({ kind: 'invalid_input', field: 'genreIds', message: 'expected an array of UUIDs' })
  }

  const ids = new Set<GenreId>()
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'string') {
      return err({ kind: 'invalid_input', field: 'genreIds', message: 'expected an array of UUIDs' })
    }
    const id = parseGenreId(entry, 'genreIds')
    if (!id.ok) return id
    ids.add(id.value)
  }

  return ok([...ids])
}

/**
 * The trust boundary.
 *
 * Types are erased at runtime, so a JSON payload is `unknown` no matter what the
 * route contract promises. This function is the only thing that turns it into a
 * NewGame, and the compiler checks that its output really has that shape.
 *
 * `genreIds` is optional: a game can start with no genres.
 */
export const parseNewGame = (input: unknown): Result<NewGame, ApiError> => {
  const raw = asJsonObject(input)
  if (!raw.ok) return raw

  const name = validateName(raw.value.name)
  if (!name.ok) return name

  const releaseYear = validateReleaseYear(raw.value.releaseYear)
  if (!releaseYear.ok) return releaseYear

  const genreIds = 'genreIds' in raw.value ? validateGenreIds(raw.value.genreIds) : ok([])
  if (!genreIds.ok) return genreIds

  return ok({ name: name.value, releaseYear: releaseYear.value, genreIds: genreIds.value })
}

/** A `genreIds` in a patch replaces the game's whole genre set; `[]` clears it. */
export const parsePatchGame = (input: unknown): Result<PatchGame, ApiError> => {
  const raw = asJsonObject(input)
  if (!raw.ok) return raw

  const patch: { name?: string; releaseYear?: number; genreIds?: readonly GenreId[] } = {}

  if ('name' in raw.value) {
    const name = validateName(raw.value.name)
    if (!name.ok) return name
    patch.name = name.value
  }

  if ('releaseYear' in raw.value) {
    const releaseYear = validateReleaseYear(raw.value.releaseYear)
    if (!releaseYear.ok) return releaseYear
    patch.releaseYear = releaseYear.value
  }

  if ('genreIds' in raw.value) {
    const genreIds = validateGenreIds(raw.value.genreIds)
    if (!genreIds.ok) return genreIds
    patch.genreIds = genreIds.value
  }

  if (patch.name === undefined && patch.releaseYear === undefined && patch.genreIds === undefined) {
    return err({ kind: 'invalid_input', field: 'body', message: 'expected at least one field to update' })
  }

  return ok(patch)
}
