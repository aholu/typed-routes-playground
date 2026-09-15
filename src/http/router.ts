import { err, ok, type Result } from '../domain/result.js'
import { toHttpFailure, type ApiError } from '../domain/errors.js'
import type { BodyParserMap, HandlerMap, RouteKey, SuccessStatusMap } from '../api/routes.js'

export type HttpRequest = {
  readonly method: string
  readonly path: string
  readonly rawBody: string
}

export type HttpResponse = {
  readonly status: number
  readonly body: unknown
}

/**
 * The erased view of a handler.
 *
 * A Map<RouteKey, Handler<K>> cannot exist: the link between a key and its
 * signature is per-key, while a container has one element type. So the dispatch
 * loop works with erased signatures and one cast, kept in this file only.
 */
type ErasedHandler = (input: { params: Record<string, string>; body: unknown }) => Promise<Result<unknown, ApiError>>

type ErasedParser = (raw: unknown) => Result<unknown, ApiError>

/** Match 'GET /games/:id' against an incoming method and path. */
const matchRoute = (key: RouteKey, method: string, path: string): Record<string, string> | null => {
  const [routeMethod = '', routePath = ''] = key.split(' ')
  if (routeMethod !== method) return null

  const routeSegments = routePath.split('/').filter((segment) => segment.length > 0)
  const pathSegments = path.split('/').filter((segment) => segment.length > 0)
  if (routeSegments.length !== pathSegments.length) return null

  const params: Record<string, string> = {}

  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index] ?? ''
    const pathSegment = pathSegments[index] ?? ''

    if (routeSegment.startsWith(':')) {
      params[routeSegment.slice(1)] = decodeURIComponent(pathSegment)
      continue
    }

    if (routeSegment !== pathSegment) return null
  }

  return params
}

const decodeJson = (raw: string): Result<unknown, ApiError> => {
  if (raw.trim().length === 0) {
    return err({ kind: 'invalid_input', field: 'body', message: 'expected a JSON body' })
  }

  try {
    return ok(JSON.parse(raw) as unknown)
  } catch {
    return err({ kind: 'invalid_input', field: 'body', message: 'body is not valid JSON' })
  }
}

export const createRouter = (
  handlers: HandlerMap,
  parsers: BodyParserMap,
  successStatus: SuccessStatusMap,
): ((request: HttpRequest) => Promise<HttpResponse>) => {
  // The runtime route list is derived from the type-checked map, so it can never
  // drift out of sync with the Routes table.
  const keys = Object.keys(handlers) as RouteKey[]
  const erasedParsers = parsers as Record<string, ErasedParser | undefined>

  return async (request) => {
    for (const key of keys) {
      const params = matchRoute(key, request.method, request.path)
      if (params === null) continue

      let body: unknown

      const parser = erasedParsers[key]
      if (parser !== undefined) {
        const decoded = decodeJson(request.rawBody)
        if (!decoded.ok) return toHttpFailure(decoded.error)

        const parsed = parser(decoded.value)
        if (!parsed.ok) return toHttpFailure(parsed.error)

        body = parsed.value
      }

      const handler = handlers[key] as unknown as ErasedHandler
      const result = await handler({ params, body })

      return result.ok ? { status: successStatus[key], body: result.value } : toHttpFailure(result.error)
    }

    return {
      status: 404,
      body: { error: 'not_found', detail: `no route matches ${request.method} ${request.path}` },
    }
  }
}
