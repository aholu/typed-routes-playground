import { err, ok } from '../domain/result.js'
import { newGameId, parseGameId, parseNewGame, parsePatchGame } from '../domain/game.js'
import { newGenreId, parseGenreId, parseNewGenre, parsePatchGenre } from '../domain/genre.js'
import type { GameStore } from '../repository/game-store.js'
import type { GenreStore } from '../repository/genre-store.js'
import type { BodyParserMap, HandlerMap, SuccessStatusMap } from './routes.js'

export type Stores = {
  readonly games: GameStore
  readonly genres: GenreStore
}

/**
 * Note what is NOT written here: no parameter types, no return annotations on
 * the individual handlers. The HandlerMap annotation on the factory pushes them
 * down into every entry.
 */
export const createHandlers = ({ games, genres }: Stores): HandlerMap => ({
  'GET /': async () => ok({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }),

  'GET /games': async () => ok(await games.list()),

  'GET /games/:id': async ({ params }) => {
    const id = parseGameId(params.id)
    // An Err already satisfies this route's Result, so it passes straight through.
    if (!id.ok) return id

    const game = await games.find(id.value)
    if (game === undefined) return err({ kind: 'not_found', resource: 'game', id: params.id })

    return ok(game)
  },

  'POST /games': async ({ body }) => games.save(newGameId(), body),

  'PATCH /games/:id': async ({ params, body }) => {
    const id = parseGameId(params.id)
    if (!id.ok) return id

    const updated = await games.update(id.value, body)
    if (updated === undefined) return err({ kind: 'not_found', resource: 'game', id: params.id })

    return updated
  },

  'DELETE /games/:id': async ({ params }) => {
    const id = parseGameId(params.id)
    if (!id.ok) return id

    if (!(await games.remove(id.value))) {
      return err({ kind: 'not_found', resource: 'game', id: params.id })
    }

    return ok({ deleted: id.value })
  },

  'GET /genres': async () => ok(await genres.list()),

  'GET /genres/:id': async ({ params }) => {
    const id = parseGenreId(params.id)
    if (!id.ok) return id

    const genre = await genres.find(id.value)
    if (genre === undefined) return err({ kind: 'not_found', resource: 'genre', id: params.id })

    return ok(genre)
  },

  'POST /genres': async ({ body }) => genres.save(newGenreId(), body),

  'PATCH /genres/:id': async ({ params, body }) => {
    const id = parseGenreId(params.id)
    if (!id.ok) return id

    const updated = await genres.update(id.value, body)
    if (updated === undefined) return err({ kind: 'not_found', resource: 'genre', id: params.id })

    return updated
  },

  'DELETE /genres/:id': async ({ params }) => {
    const id = parseGenreId(params.id)
    if (!id.ok) return id

    if (!(await genres.remove(id.value))) {
      return err({ kind: 'not_found', resource: 'genre', id: params.id })
    }

    return ok({ deleted: id.value })
  },
})

/** Only routes declaring a body can appear here — the map type allows nothing else. */
export const bodyParsers: BodyParserMap = {
  'POST /games': parseNewGame,
  'PATCH /games/:id': parsePatchGame,
  'POST /genres': parseNewGenre,
  'PATCH /genres/:id': parsePatchGenre,
}

export const successStatus: SuccessStatusMap = {
  'GET /': 200,
  'GET /games': 200,
  'GET /games/:id': 200,
  'POST /games': 201,
  'PATCH /games/:id': 200,
  'DELETE /games/:id': 200,
  'GET /genres': 200,
  'GET /genres/:id': 200,
  'POST /genres': 201,
  'PATCH /genres/:id': 200,
  'DELETE /genres/:id': 200,
}
