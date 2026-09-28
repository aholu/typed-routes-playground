import type { ApiError } from '../domain/errors.js'
import type { Result } from '../domain/result.js'
import type { Genre, GenreId, NewGenre, PatchGenre } from '../domain/genre.js'

export type GenreStore = {
  list(): Promise<readonly Genre[]>
  find(id: GenreId): Promise<Genre | undefined>
  save(id: GenreId, genre: NewGenre): Promise<Result<Genre, ApiError>>
  update(id: GenreId, patch: PatchGenre): Promise<Result<Genre, ApiError> | undefined>
  remove(id: GenreId): Promise<boolean>
}
