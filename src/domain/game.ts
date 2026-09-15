import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from './result.js'
import type { ApiError } from './errors.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Branded type.
 *
 * GameId is a string at runtime, but a separate type at compile time: the symbol
 * below exists only in the type world, so nothing can produce a GameId by
 * accident. A plain string is never assignable to it.
 */
declare const brand: unique symbol

type Brand<T, B extends string> = T & { readonly [brand]: B }

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
}

/** What a client sends when creating a game: everything except the id. */
export type NewGame = Omit<Game, 'id'>

/** The single place where a plain string becomes a GameId. */
export const parseGameId = (raw: string): Result<GameId, ApiError> =>
  UUID_PATTERN.test(raw) ? ok(raw as GameId) : err({ kind: 'invalid_input', field: 'id', message: 'expected a UUID' })

/** Wire format in, domain model out. Field renaming happens here and nowhere else. */
export const fromDto = (dto: GameDto): Result<Game, ApiError> => {
  const id = parseGameId(dto.uuid)
  if (!id.ok) return id

  return ok({ id: id.value, name: dto.name, releaseYear: dto.release_year })
}

/** Generates a fresh id. The only caller of parseGameId that cannot fail. */
export const newGameId = (): GameId => {
  const id = parseGameId(randomUUID())
  if (!id.ok) throw new Error('unreachable: randomUUID produced an invalid uuid')
  return id.value
}

/**
 * The trust boundary.
 *
 * Types are erased at runtime, so a JSON payload is `unknown` no matter what the
 * route contract promises. This function is the only thing that turns it into a
 * NewGame, and the compiler checks that its output really has that shape.
 */
export const parseNewGame = (input: unknown): Result<NewGame, ApiError> => {
  if (typeof input !== 'object' || input === null) {
    return err({ kind: 'invalid_input', field: 'body', message: 'expected a JSON object' })
  }

  const raw = input as Record<string, unknown>

  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    return err({ kind: 'invalid_input', field: 'name', message: 'expected a non-empty string' })
  }

  const maxYear = new Date().getFullYear() + 5
  if (typeof raw.releaseYear !== 'number' || !Number.isInteger(raw.releaseYear)) {
    return err({ kind: 'invalid_input', field: 'releaseYear', message: 'expected an integer' })
  }
  if (raw.releaseYear < 1960 || raw.releaseYear > maxYear) {
    return err({ kind: 'invalid_input', field: 'releaseYear', message: `expected 1960-${maxYear}` })
  }

  return ok({ name: raw.name.trim(), releaseYear: raw.releaseYear })
}
