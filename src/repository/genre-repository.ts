import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { createConflictMapper, type ConflictMapper } from './database.js'
import { err, ok, type Result } from '../domain/result.js'
import { genreFromDto, type Genre, type GenreId, type NewGenre, type PatchGenre } from '../domain/genre.js'
import type { ApiError } from '../domain/errors.js'
import type { GenreStore } from './genre-store.js'

/** Shared with GameRepository, which reads genres through a join. */
export const rowToGenre = (row: Record<string, unknown>): Result<Genre, ApiError> => {
  const { id, name, slug } = row
  if (typeof id !== 'string' || typeof name !== 'string' || typeof slug !== 'string') {
    return err({ kind: 'invalid_input', field: 'row', message: 'unexpected column types' })
  }
  return genreFromDto({ uuid: id, name, slug })
}

export class GenreRepository implements GenreStore {
  readonly #listStmt: StatementSync
  readonly #findStmt: StatementSync
  readonly #insertStmt: StatementSync
  readonly #updateStmt: StatementSync
  readonly #removeStmt: StatementSync
  readonly #toConflict: ConflictMapper

  constructor(db: DatabaseSync) {
    this.#listStmt = db.prepare('SELECT id, name, slug FROM genres ORDER BY name')
    this.#findStmt = db.prepare('SELECT id, name, slug FROM genres WHERE id = ?')
    this.#insertStmt = db.prepare('INSERT INTO genres (id, name, slug) VALUES (?, ?, ?)')
    this.#updateStmt = db.prepare('UPDATE genres SET name = ?, slug = ? WHERE id = ?')
    this.#removeStmt = db.prepare('DELETE FROM genres WHERE id = ?')
    this.#toConflict = createConflictMapper(db, 'genres', 'genre')
  }

  async list(): Promise<readonly Genre[]> {
    const genres: Genre[] = []
    for (const row of this.#listStmt.all()) {
      const genre = rowToGenre(row)
      if (genre.ok) {
        genres.push(genre.value)
      } else {
        console.warn('skipping corrupt genre row:', row, genre.error)
      }
    }
    return genres
  }

  async find(id: GenreId): Promise<Genre | undefined> {
    const row = this.#findStmt.get(id)
    if (row === undefined) return undefined

    const genre = rowToGenre(row)
    if (!genre.ok) {
      console.warn(`corrupt row for genre ${id}:`, genre.error)
      return undefined
    }
    return genre.value
  }

  async save(id: GenreId, genre: NewGenre): Promise<Result<Genre, ApiError>> {
    try {
      this.#insertStmt.run(id, genre.name, genre.slug)
      return ok({ id, ...genre })
    } catch (cause) {
      return this.#toConflict(cause, { id, ...genre })
    }
  }

  async update(id: GenreId, patch: PatchGenre): Promise<Result<Genre, ApiError> | undefined> {
    const current = await this.find(id)
    if (current === undefined) return undefined

    const next: Genre = { id, name: patch.name ?? current.name, slug: patch.slug ?? current.slug }

    try {
      this.#updateStmt.run(next.name, next.slug, id)
      return ok(next)
    } catch (cause) {
      return this.#toConflict(cause, next)
    }
  }

  async remove(id: GenreId): Promise<boolean> {
    return this.#removeStmt.run(id).changes > 0
  }
}
