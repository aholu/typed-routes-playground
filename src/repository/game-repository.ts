import { rawGames } from '../data/games.js'
import { fromDto, type Game, type GameId, type GameDto } from '../domain/game.js'

export class GameRepository {
  readonly #games = new Map<GameId, Game>()

  constructor(source: readonly GameDto[] = rawGames) {
    for (const dto of source) {
      const game = fromDto(dto)
      // Malformed rows are skipped rather than crashing startup.
      if (game.ok) this.#games.set(game.value.id, game.value)
    }
  }

  list(): readonly Game[] {
    return [...this.#games.values()]
  }

  find(id: GameId): Game | undefined {
    return this.#games.get(id)
  }

  save(game: Game): Game {
    this.#games.set(game.id, game)
    return game
  }

  remove(id: GameId): boolean {
    return this.#games.delete(id)
  }
}
