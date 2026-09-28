import type { ApiError } from '../domain/errors.js'
import type { Result } from '../domain/result.js'
import type { Game, GameId, NewGame, PatchGame } from '../domain/game.js'

export type GameStore = {
  list(): Promise<readonly Game[]>
  find(id: GameId): Promise<Game | undefined>
  /** Fails with invalid_input when a genre id does not exist, conflict when the name is taken. */
  save(id: GameId, game: NewGame): Promise<Result<Game, ApiError>>
  update(id: GameId, patch: PatchGame): Promise<Result<Game, ApiError> | undefined>
  remove(id: GameId): Promise<boolean>
}
