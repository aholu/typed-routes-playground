import type { ApiError } from '../domain/errors.js'
import type { Result } from '../domain/result.js'
import type { Game, GameId, NewGame } from '../domain/game.js'

/**
 * THE SINGLE SOURCE OF TRUTH.
 *
 * Every type below is computed from this table: path parameters, request body,
 * response shape, handler signatures, even the runtime list of routes. Editing
 * this table is the only way to change the API surface.
 */
export type Routes = {
  'GET /': { response: { readonly status: 'ok'; readonly uptimeSeconds: number } }
  'GET /games': { response: readonly Game[] }
  'GET /games/:id': { response: Game }
  'POST /games': { body: NewGame; response: Game }
  'DELETE /games/:id': { response: { readonly deleted: GameId } }
}

export type RouteKey = keyof Routes

/** 'GET /games/:id' -> '/games/:id' */
type PathOf<K extends RouteKey> = K extends `${string} ${infer P}` ? P : never

/**
 * Reads ':name' segments straight out of the path string.
 * '/games/:id' produces { id: string }, '/games' produces no keys at all.
 */
type PathParams<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? { readonly [Key in Param]: string } & PathParams<Rest>
  : P extends `${string}:${infer Param}`
    ? { readonly [Key in Param]: string }
    : Record<never, string>

export type ParamsOf<K extends RouteKey> = PathParams<PathOf<K>>

/** Routes that declare no body get `undefined`, so handlers cannot read one. */
export type BodyOf<K extends RouteKey> = Routes[K] extends { body: infer B } ? B : undefined

export type ResponseOf<K extends RouteKey> = Routes[K]['response']

export type Handler<K extends RouteKey> = (input: {
  readonly params: ParamsOf<K>
  readonly body: BodyOf<K>
}) => Promise<Result<ResponseOf<K>, ApiError>>

/**
 * A mapped type over every route key. Implementing this map is all or nothing:
 * a missing route is a compile error, and so is a route that no longer exists.
 */
export type HandlerMap = { readonly [K in RouteKey]: Handler<K> }

/**
 * Key remapping with `as`: routes whose contract has no `body` are mapped to
 * `never` and vanish from the map. Only 'POST /games' survives, so a parser
 * cannot be registered for a route that never receives a body.
 */
export type BodyParserMap = {
  readonly [K in RouteKey as Routes[K] extends { body: unknown } ? K : never]: (
    raw: unknown,
  ) => Result<BodyOf<K>, ApiError>
}

/** Every route must state its success status code. */
export type HttpSuccessStatus = 200 | 201
export type SuccessStatusMap = { readonly [K in RouteKey]: HttpSuccessStatus }
