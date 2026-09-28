import { DatabaseSync } from 'node:sqlite'
import { seedData, type SeedData } from './seed-data.js'
import { fromDto } from '../domain/game.js'
import { genreFromDto, type GenreId } from '../domain/genre.js'
import { err, ok, type Result } from '../domain/result.js'
import type { ApiError } from '../domain/errors.js'

// SQLITE_CONSTRAINT_UNIQUE, from https://www.sqlite.org/rescode.html#constraint_unique
const SQLITE_CONSTRAINT_UNIQUE = 2067

const isUniqueConstraintViolation = (cause: unknown): boolean =>
  typeof cause === 'object' && cause !== null && 'errcode' in cause && cause.errcode === SQLITE_CONSTRAINT_UNIQUE

/** The unique columns games and genres have in common. */
type NamedRow = { readonly id: string; readonly name: string; readonly slug: string }

export type ConflictMapper = (cause: unknown, row: NamedRow) => Result<never, ApiError>

/**
 * SQLite only reports that some unique constraint failed; this finds which
 * one, to name it in a 409, and rethrows anything that is not a unique
 * violation. The row itself is excluded from the lookup: on update, a slug
 * clash must not be reported as a clash with the row's own name.
 */
export const createConflictMapper = (db: DatabaseSync, table: 'games' | 'genres', resource: string): ConflictMapper => {
  const nameTaken = db.prepare(`SELECT 1 FROM ${table} WHERE name = ? AND id != ?`)
  const slugTaken = db.prepare(`SELECT 1 FROM ${table} WHERE slug = ? AND id != ?`)

  return (cause, row) => {
    if (isUniqueConstraintViolation(cause)) {
      if (nameTaken.get(row.name, row.id) !== undefined) {
        return err({ kind: 'conflict', message: `${resource} "${row.name}" already exists` })
      }
      if (slugTaken.get(row.slug, row.id) !== undefined) {
        return err({ kind: 'conflict', message: `slug "${row.slug}" is already taken` })
      }
    }
    throw cause
  }
}

/**
 * Runs `work` in a transaction. An Ok commits; an Err or a throw rolls back, so
 * a failure found halfway through a multi-statement write leaves nothing behind.
 */
export const transaction = <T, E>(db: DatabaseSync, work: () => Result<T, E>): Result<T, E> => {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec(result.ok ? 'COMMIT' : 'ROLLBACK')
    return result
  } catch (cause) {
    db.exec('ROLLBACK')
    throw cause
  }
}

/**
 * The whole schema, applied in one go to a fresh file. There are no
 * migrations: a file created by any other schema version is rejected, see
 * createOrCheckSchema.
 */
const SCHEMA = `
  CREATE TABLE games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    slug TEXT NOT NULL UNIQUE,
    release_year INTEGER NOT NULL
  );
  CREATE TABLE genres (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    slug TEXT NOT NULL UNIQUE
  );
  -- The link has no identity of its own, so the pair is the primary key: it is
  -- the uniqueness rule and the index for "genres of a game" at once. The extra
  -- index serves the reverse direction, including ON DELETE CASCADE from genres.
  CREATE TABLE game_genres (
    game_id TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    genre_id TEXT NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, genre_id)
  ) WITHOUT ROWID;
  CREATE INDEX game_genres_genre_id ON game_genres (genre_id);
`

/**
 * Bumped on every schema change. It must differ from every earlier value
 * (1: games only, 2: without game slugs), or an old file would pass the check.
 */
const SCHEMA_VERSION = 3

const createOrCheckSchema = (db: DatabaseSync, dbPath: string): void => {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (version === SCHEMA_VERSION) return

  const isFreshDatabase =
    version === 0 && db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table'").get() === undefined
  if (!isFreshDatabase) {
    throw new Error(
      `${dbPath}: schema version ${version} does not match expected ${SCHEMA_VERSION} — ` +
        'no migrations exist in this sandbox, delete the file (pnpm clean:db) and restart to reseed',
    )
  }

  // user_version is part of the database file, so it commits together with the schema it records.
  transaction(db, () => {
    db.exec(SCHEMA)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    return ok(undefined)
  })
}

const isEmpty = (db: DatabaseSync, table: 'games' | 'genres'): boolean => {
  const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count
  if (typeof count !== 'number') throw new Error('unreachable: COUNT(*) did not return a number')
  return count === 0
}

/**
 * Each table is seeded only while it is empty, so reseeded genres link only
 * to the seed games still present. Malformed rows are skipped rather than
 * crashing startup.
 */
const seed = (db: DatabaseSync, source: SeedData): void => {
  if (isEmpty(db, 'games')) {
    const insertGame = db.prepare('INSERT INTO games (id, name, slug, release_year) VALUES (?, ?, ?, ?)')
    for (const [uuid, game] of Object.entries(source.games)) {
      const parsed = fromDto({ uuid, ...game })
      if (parsed.ok) insertGame.run(parsed.value.id, parsed.value.name, parsed.value.slug, parsed.value.releaseYear)
    }
  }

  if (!isEmpty(db, 'genres')) return

  const insertGenre = db.prepare('INSERT INTO genres (id, name, slug) VALUES (?, ?, ?)')
  const genreIdsBySlug = new Map<string, GenreId>()
  for (const [uuid, genre] of Object.entries(source.genres)) {
    const parsed = genreFromDto({ uuid, ...genre })
    if (!parsed.ok) continue
    insertGenre.run(parsed.value.id, parsed.value.name, parsed.value.slug)
    genreIdsBySlug.set(parsed.value.slug, parsed.value.id)
  }

  const gameExists = db.prepare('SELECT 1 FROM games WHERE id = ?')
  const insertLink = db.prepare('INSERT OR IGNORE INTO game_genres (game_id, genre_id) VALUES (?, ?)')
  for (const [gameId, slugs = []] of Object.entries(source.gameGenres)) {
    if (gameExists.get(gameId) === undefined) continue
    for (const slug of slugs) {
      const genreId = genreIdsBySlug.get(slug)
      if (genreId !== undefined) insertLink.run(gameId, genreId)
    }
  }
}

/**
 * Opens the SQLite file, creates the schema if the file is new and seeds empty tables.
 * Foreign keys are off by default in SQLite itself; the option is spelled out
 * because the game_genres links rely on them for integrity and cascades.
 */
export const openDatabase = (dbPath: string, source: SeedData = seedData): DatabaseSync => {
  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true })
  try {
    createOrCheckSchema(db, dbPath)
    seed(db, source)
  } catch (cause) {
    db.close()
    throw cause
  }
  return db
}
