import { err, ok } from '../domain/result.js'
import { newGameId, parseGameId, parseNewGame, parsePatchGame } from '../domain/game.js'
import type { GameStore } from '../repository/game-store.js'
import type { BodyParserMap, HandlerMap, SuccessStatusMap } from './routes.js'

/**
 * Note what is NOT written here: no parameter types, no return annotations on
 * the individual handlers. The HandlerMap annotation on the factory pushes them
 * down into every entry.
 */
export const createHandlers = (store: GameStore): HandlerMap => ({
  'GET /': async () => ok({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }),

  'GET /games': async () => ok(await store.list()),

  'GET /games/:id': async ({ params }) => {
    const id = parseGameId(params.id)
    // An Err already satisfies this route's Result, so it passes straight through.
    if (!id.ok) return id

    const game = await store.find(id.value)
    if (game === undefined) return err({ kind: 'not_found', resource: 'game', id: params.id })

    return ok(game)
  },

  'POST /games': async ({ body }) => store.save({ id: newGameId(), ...body }),

  'PATCH /games/:id': async ({ params, body }) => {
    const id = parseGameId(params.id)
    if (!id.ok) return id

    const updated = await store.update(id.value, body)
    if (updated === undefined) return err({ kind: 'not_found', resource: 'game', id: params.id })

    return updated
  },

  'DELETE /games/:id': async ({ params }) => {
    const id = parseGameId(params.id)
    if (!id.ok) return id

    if (!(await store.remove(id.value))) {
      return err({ kind: 'not_found', resource: 'game', id: params.id })
    }

    return ok({ deleted: id.value })
  },
})

/** Only routes declaring a body can appear here — the map type allows nothing else. */
export const bodyParsers: BodyParserMap = {
  'POST /games': parseNewGame,
  'PATCH /games/:id': parsePatchGame,
}

export const successStatus: SuccessStatusMap = {
  'GET /': 200,
  'GET /games': 200,
  'GET /games/:id': 200,
  'POST /games': 201,
  'PATCH /games/:id': 200,
  'DELETE /games/:id': 200,
}
