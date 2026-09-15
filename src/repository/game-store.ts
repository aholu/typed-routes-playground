import type { ApiError } from '../domain/errors.js'
import type { Result } from '../domain/result.js'
import type { Game, GameId, PatchGame } from '../domain/game.js'

export type GameStore = {
  list(): Promise<readonly Game[]>
  find(id: GameId): Promise<Game | undefined>
  save(game: Game): Promise<Result<Game, ApiError>>
  update(id: GameId, patch: PatchGame): Promise<Result<Game, ApiError> | undefined>
  remove(id: GameId): Promise<boolean>
}
