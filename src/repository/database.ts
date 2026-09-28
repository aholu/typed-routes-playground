import { DatabaseSync } from 'node:sqlite'
import { seedData, type SeedData } from './seed-data.js'
import { fromDto } from '../domain/game.js'
import { genreFromDto, type GenreId } from '../domain/genre.js'
import { ok, type Result } from '../domain/result.js'

// SQLITE_CONSTRAINT_UNIQUE, from https://www.sqlite.org/rescode.html#constraint_unique
const SQLITE_CONSTRAINT_UNIQUE = 2067

export const isUniqueConstraintViolation = (cause: unknown): boolean =>
  typeof cause === 'object' && cause !== null && 'errcode' in cause && cause.errcode === SQLITE_CONSTRAINT_UNIQUE

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
 * Schema history, oldest first. Entry N brings a database from user_version N
 * to N + 1; entries are append-only once released.
 */
const MIGRATIONS: readonly string[] = [
  `
    CREATE TABLE games (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      release_year INTEGER NOT NULL
    )
  `,
  // The link has no identity of its own, so the pair is the primary key: it is
  // the uniqueness rule and the index for "genres of a game" at once. The extra
  // index serves the reverse direction, including ON DELETE CASCADE from genres.
  `
    CREATE TABLE genres (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      slug TEXT NOT NULL UNIQUE
    );
    CREATE TABLE game_genres (
      game_id TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
      genre_id TEXT NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
      PRIMARY KEY (game_id, genre_id)
    ) WITHOUT ROWID;
    CREATE INDEX game_genres_genre_id ON game_genres (genre_id);
  `,
]

const SCHEMA_VERSION = MIGRATIONS.length

const migrate = (db: DatabaseSync, dbPath: string): void => {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  const predatesVersioning =
    version === 0 &&
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'games'").get() !== undefined

  if (predatesVersioning || version > SCHEMA_VERSION) {
    throw new Error(
      `${dbPath}: schema version ${version} is not one this build can migrate from ` +
        `(expected 0-${SCHEMA_VERSION}; 0 with existing tables means a database predating schema versioning) — ` +
        'delete the file and restart to reseed',
    )
  }

  for (const [index, sql] of MIGRATIONS.entries()) {
    if (index < version) continue
    // user_version is part of the database file, so it commits or rolls back
    // together with the migration it records.
    transaction(db, () => {
      db.exec(sql)
      db.exec(`PRAGMA user_version = ${index + 1}`)
      return ok(undefined)
    })
  }
}

const isEmpty = (db: DatabaseSync, table: 'games' | 'genres'): boolean => {
  const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count
  if (typeof count !== 'number') throw new Error('unreachable: COUNT(*) did not return a number')
  return count === 0
}

/**
 * Each table is seeded only while it is empty. A database migrated from an
 * older schema keeps its games and still gets the seed genres, linked to
 * whichever seed games it still has. Malformed rows are skipped rather than
 * crashing startup.
 */
const seed = (db: DatabaseSync, source: SeedData): void => {
  if (isEmpty(db, 'games')) {
    const insertGame = db.prepare('INSERT INTO games (id, name, release_year) VALUES (?, ?, ?)')
    for (const [uuid, game] of Object.entries(source.games)) {
      const parsed = fromDto({ uuid, ...game })
      if (parsed.ok) insertGame.run(parsed.value.id, parsed.value.name, parsed.value.releaseYear)
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
 * Opens the SQLite file, brings its schema up to date and seeds empty tables.
 * Foreign keys are off by default in SQLite itself; the option is spelled out
 * because the game_genres links rely on them for integrity and cascades.
 */
export const openDatabase = (dbPath: string, source: SeedData = seedData): DatabaseSync => {
  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true })
  try {
    migrate(db, dbPath)
    seed(db, source)
  } catch (cause) {
    db.close()
    throw cause
  }
  return db
}
