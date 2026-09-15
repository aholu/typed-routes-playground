import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { rawGames, type SeedData } from '../data/games.js'
import { err, ok, type Result } from '../domain/result.js'
import { fromDto, type Game, type GameId } from '../domain/game.js'
import type { ApiError } from '../domain/errors.js'
import type { GameStore } from './game-store.js'

// SQLITE_CONSTRAINT_UNIQUE, from https://www.sqlite.org/rescode.html#constraint_unique
const SQLITE_CONSTRAINT_UNIQUE = 2067

const isUniqueConstraintViolation = (cause: unknown): boolean =>
  typeof cause === 'object' && cause !== null && 'errcode' in cause && cause.errcode === SQLITE_CONSTRAINT_UNIQUE

const rowToGame = (row: Record<string, unknown>): Result<Game, ApiError> => {
  const { id, name, release_year: releaseYear } = row
  if (typeof id !== 'string' || typeof name !== 'string' || typeof releaseYear !== 'number') {
    return err({ kind: 'invalid_input', field: 'row', message: 'unexpected column types' })
  }
  return fromDto({ uuid: id, name, release_year: releaseYear })
}

const INSERT = 'INSERT INTO games (id, name, release_year) VALUES (?, ?, ?)'

const SCHEMA_VERSION = 1

export class GameRepository implements GameStore {
  readonly #db: DatabaseSync
  readonly #listStmt: StatementSync
  readonly #findStmt: StatementSync
  readonly #insertStmt: StatementSync
  readonly #removeStmt: StatementSync
  readonly #nameExistsStmt: StatementSync

  constructor(dbPath: string, source: SeedData = rawGames) {
    this.#db = new DatabaseSync(dbPath)

    const { user_version: version } = this.#db.prepare('PRAGMA user_version').get() as { user_version: number }
    const isFreshDatabase =
      version === 0 &&
      this.#db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'games'").get() === undefined

    if (isFreshDatabase) {
      this.#db.exec(`
        CREATE TABLE games (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          release_year INTEGER NOT NULL
        )
      `)
      this.#db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    } else if (version !== SCHEMA_VERSION) {
      throw new Error(
        `${dbPath}: schema version ${version} does not match expected ${SCHEMA_VERSION} ` +
          '(0 may also mean a database predating schema versioning) — ' +
          'no migrations exist in this sandbox, delete the file and restart to reseed',
      )
    }

    this.#listStmt = this.#db.prepare('SELECT id, name, release_year FROM games ORDER BY rowid')
    this.#findStmt = this.#db.prepare('SELECT id, name, release_year FROM games WHERE id = ?')
    this.#insertStmt = this.#db.prepare(INSERT)
    this.#removeStmt = this.#db.prepare('DELETE FROM games WHERE id = ?')
    this.#nameExistsStmt = this.#db.prepare('SELECT 1 FROM games WHERE name = ?')

    this.#seed(source)
  }

  #seed(source: SeedData): void {
    const row = this.#db.prepare('SELECT COUNT(*) AS count FROM games').get()
    const count = row?.count
    if (typeof count !== 'number') throw new Error('unreachable: COUNT(*) did not return a number')
    if (count > 0) return

    for (const [uuid, game] of Object.entries(source)) {
      const parsed = fromDto({ uuid, name: game.name, release_year: game.release_year })
      // Malformed rows are skipped rather than crashing startup.
      if (parsed.ok) this.#insertStmt.run(parsed.value.id, parsed.value.name, parsed.value.releaseYear)
    }
  }

  async list(): Promise<readonly Game[]> {
    const games: Game[] = []
    for (const row of this.#listStmt.all()) {
      const game = rowToGame(row)
      if (game.ok) {
        games.push(game.value)
      } else {
        // Not the same as "no games" — the row is there, it just no longer
        // parses. Surfacing it as a gap in the list would hide a real fault.
        console.warn('skipping corrupt game row:', row, game.error)
      }
    }
    return games
  }

  async find(id: GameId): Promise<Game | undefined> {
    const row = this.#findStmt.get(id)
    if (row === undefined) return undefined

    const game = rowToGame(row)
    if (!game.ok) {
      // The row exists — this is corruption, not a missing game. A 404 would
      // say otherwise, so at least this doesn't vanish without a trace.
      console.warn(`corrupt row for game ${id}:`, game.error)
      return undefined
    }
    return game.value
  }

  async save(game: Game): Promise<Result<Game, ApiError>> {
    try {
      this.#insertStmt.run(game.id, game.name, game.releaseYear)
      return ok(game)
    } catch (cause) {
      if (isUniqueConstraintViolation(cause) && this.#nameExistsStmt.get(game.name) !== undefined) {
        return err({ kind: 'conflict', message: `"${game.name}" already exists` })
      }
      throw cause
    }
  }

  async remove(id: GameId): Promise<boolean> {
    const result = this.#removeStmt.run(id)
    return result.changes > 0
  }

  close(): void {
    this.#db.close()
  }
}
