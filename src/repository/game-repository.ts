import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { isUniqueConstraintViolation, transaction } from './database.js'
import { rowToGenre } from './genre-repository.js'
import { err, ok, type Result } from '../domain/result.js'
import { fromDto, type Game, type GameId, type GameRecord, type NewGame, type PatchGame } from '../domain/game.js'
import type { Genre, GenreId } from '../domain/genre.js'
import type { ApiError } from '../domain/errors.js'
import type { GameStore } from './game-store.js'

const rowToGameRecord = (row: Record<string, unknown>): Result<GameRecord, ApiError> => {
  const { id, name, release_year: releaseYear } = row
  if (typeof id !== 'string' || typeof name !== 'string' || typeof releaseYear !== 'number') {
    return err({ kind: 'invalid_input', field: 'row', message: 'unexpected column types' })
  }
  return fromDto({ uuid: id, name, release_year: releaseYear })
}

const GENRES_OF = `
  SELECT gg.game_id, g.id, g.name, g.slug
  FROM game_genres gg
  JOIN genres g ON g.id = gg.genre_id
`

export class GameRepository implements GameStore {
  readonly #db: DatabaseSync
  readonly #listStmt: StatementSync
  readonly #findStmt: StatementSync
  readonly #listGenresStmt: StatementSync
  readonly #findGenresStmt: StatementSync
  readonly #insertStmt: StatementSync
  readonly #updateStmt: StatementSync
  readonly #removeStmt: StatementSync
  readonly #nameExistsStmt: StatementSync
  readonly #genreExistsStmt: StatementSync
  readonly #linkStmt: StatementSync
  readonly #unlinkAllStmt: StatementSync

  constructor(db: DatabaseSync) {
    this.#db = db
    this.#listStmt = db.prepare('SELECT id, name, release_year FROM games ORDER BY rowid')
    this.#findStmt = db.prepare('SELECT id, name, release_year FROM games WHERE id = ?')
    this.#listGenresStmt = db.prepare(`${GENRES_OF} ORDER BY g.name`)
    this.#findGenresStmt = db.prepare(`${GENRES_OF} WHERE gg.game_id = ? ORDER BY g.name`)
    this.#insertStmt = db.prepare('INSERT INTO games (id, name, release_year) VALUES (?, ?, ?)')
    this.#updateStmt = db.prepare('UPDATE games SET name = ?, release_year = ? WHERE id = ?')
    this.#removeStmt = db.prepare('DELETE FROM games WHERE id = ?')
    this.#nameExistsStmt = db.prepare('SELECT 1 FROM games WHERE name = ?')
    this.#genreExistsStmt = db.prepare('SELECT 1 FROM genres WHERE id = ?')
    this.#linkStmt = db.prepare('INSERT INTO game_genres (game_id, genre_id) VALUES (?, ?)')
    this.#unlinkAllStmt = db.prepare('DELETE FROM game_genres WHERE game_id = ?')
  }

  /** Link rows grouped by game id. Two queries for the whole list, not one per game. */
  #genresByGame(rows: readonly Record<string, unknown>[]): Map<string, Genre[]> {
    const byGame = new Map<string, Genre[]>()
    for (const row of rows) {
      const genre = rowToGenre(row)
      if (!genre.ok || typeof row.game_id !== 'string') {
        console.warn('skipping corrupt genre link:', row)
        continue
      }
      const genres = byGame.get(row.game_id) ?? []
      genres.push(genre.value)
      byGame.set(row.game_id, genres)
    }
    return byGame
  }

  async list(): Promise<readonly Game[]> {
    const genresByGame = this.#genresByGame(this.#listGenresStmt.all())
    const games: Game[] = []
    for (const row of this.#listStmt.all()) {
      const game = rowToGameRecord(row)
      if (game.ok) {
        games.push({ ...game.value, genres: genresByGame.get(game.value.id) ?? [] })
      } else {
        // Not the same as "no games" — the row is there, it just no longer
        // parses. Surfacing it as a gap in the list would hide a real fault.
        console.warn('skipping corrupt game row:', row, game.error)
      }
    }
    return games
  }

  /** Synchronous so that writes can read their own result inside a transaction. */
  #read(id: GameId): Game | undefined {
    const row = this.#findStmt.get(id)
    if (row === undefined) return undefined

    const game = rowToGameRecord(row)
    if (!game.ok) {
      // The row exists — this is corruption, not a missing game. A 404 would
      // say otherwise, so at least this doesn't vanish without a trace.
      console.warn(`corrupt row for game ${id}:`, game.error)
      return undefined
    }
    return { ...game.value, genres: this.#genresByGame(this.#findGenresStmt.all(id)).get(id) ?? [] }
  }

  async find(id: GameId): Promise<Game | undefined> {
    return this.#read(id)
  }

  /** Just written in the same transaction, so a miss is a broken invariant, not a 404. */
  #readWritten(id: GameId): Result<Game, ApiError> {
    const game = this.#read(id)
    if (game === undefined) throw new Error(`unreachable: game ${id} unreadable right after writing it`)
    return ok(game)
  }

  /** The body only promised well-formed ids; this is where they must also exist. */
  #checkGenresExist(genreIds: readonly GenreId[]): Result<undefined, ApiError> {
    const missing = genreIds.find((genreId) => this.#genreExistsStmt.get(genreId) === undefined)
    return missing === undefined
      ? ok(undefined)
      : err({ kind: 'invalid_input', field: 'genreIds', message: `genre "${missing}" does not exist` })
  }

  #replaceGenres(id: GameId, genreIds: readonly GenreId[]): void {
    this.#unlinkAllStmt.run(id)
    for (const genreId of genreIds) this.#linkStmt.run(id, genreId)
  }

  #toConflict(cause: unknown, name: string): Result<never, ApiError> {
    if (isUniqueConstraintViolation(cause) && this.#nameExistsStmt.get(name) !== undefined) {
      return err({ kind: 'conflict', message: `"${name}" already exists` })
    }
    throw cause
  }

  async save(id: GameId, game: NewGame): Promise<Result<Game, ApiError>> {
    return transaction(this.#db, () => {
      const genresExist = this.#checkGenresExist(game.genreIds)
      if (!genresExist.ok) return genresExist

      try {
        this.#insertStmt.run(id, game.name, game.releaseYear)
      } catch (cause) {
        return this.#toConflict(cause, game.name)
      }

      this.#replaceGenres(id, game.genreIds)
      return this.#readWritten(id)
    })
  }

  async update(id: GameId, patch: PatchGame): Promise<Result<Game, ApiError> | undefined> {
    const current = this.#read(id)
    if (current === undefined) return undefined

    return transaction(this.#db, () => {
      if (patch.genreIds !== undefined) {
        const genresExist = this.#checkGenresExist(patch.genreIds)
        if (!genresExist.ok) return genresExist
      }

      const name = patch.name ?? current.name
      try {
        this.#updateStmt.run(name, patch.releaseYear ?? current.releaseYear, id)
      } catch (cause) {
        return this.#toConflict(cause, name)
      }

      if (patch.genreIds !== undefined) this.#replaceGenres(id, patch.genreIds)
      return this.#readWritten(id)
    })
  }

  /** Its genre links go with it: ON DELETE CASCADE on game_genres. */
  async remove(id: GameId): Promise<boolean> {
    return this.#removeStmt.run(id).changes > 0
  }
}
