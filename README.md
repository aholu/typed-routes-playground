# typed-routes-playground

A toy HTTP API where the route table is the single source of truth: handler
signatures, path parameters and response shapes are all computed from it by the
type system.

> **This is a sandbox, not a library.** It exists to play with TypeScript as a
> design tool. Storage is an in-memory `Map`, there are no tests beyond
> `tsc --noEmit`, and nothing here is meant for production use.

No framework, no validation library, no ORM — just Node's built-in `http`, so
that every guarantee is visibly the work of the compiler rather than of a
dependency. The domain (a catalogue of Xbox games) is deliberately boring.

## Running it

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm check    # type check — this is the test suite
```

```bash
curl localhost:3000/games
curl localhost:3000/games/5e10d294-118c-428a-bf90-e55d21a12093
curl -X POST localhost:3000/games -d '{"name":"Grounded","releaseYear":2022}'
curl -X DELETE localhost:3000/games/5e10d294-118c-428a-bf90-e55d21a12093

curl -i localhost:3000/games/not-a-uuid   # 422
curl -i localhost:3000/players            # 404
```

Writes are lost on restart — the store is seeded from `src/data/games.ts`.

## The idea

One object type drives everything else:

```ts
export type Routes = {
  'GET /games': { response: readonly Game[] }
  'GET /games/:id': { response: Game }
  'POST /games': { body: NewGame; response: Game }
  'DELETE /games/:id': { response: { readonly deleted: GameId } }
}
```

Add a line to it and the compiler lists the work: a missing handler, a missing
status code, a missing body parser. The table cannot drift from the
implementation.

What that buys, concretely:

- **Path params come from the route key.** `'GET /games/:id'` gives handlers
  `{ id: string }`; `'GET /games'` gives an object with no keys, so a list
  handler cannot read `params.id`. Template literal types do the parsing.
- **Handlers carry no annotations.** `HandlerMap` is a mapped type over the
  route keys; implementing it is all-or-nothing.
- **Bodies exist only where declared.** Key remapping drops routes without a
  `body` field, so a parser cannot be registered for `GET /games`.
- **Ids are branded.** `GameId` is a `string` at runtime but unreachable
  without `parseGameId`, so the repository cannot be queried with unvalidated
  input.
- **Failure is a value.** `Result<T, E>` forces a check before `value` can be
  read, and `ApiError` maps to status codes under an exhaustiveness check.
- **One deliberate hole, contained.** The dispatch loop in `src/http/router.ts`
  needs a cast, because a container cannot express a per-key relation between a
  route and a function signature. Three unsafe lines, fully typed surface
  around them.

## Layout

```
src/
  domain/      Game model, branded ids, Result, ApiError — no HTTP in here
  data/        Seed rows in wire format
  repository/  In-memory store keyed by GameId
  api/         Route table, computed handler types, handlers
  http/        Dispatch loop and Node server adapter
```

## Things left to try

- Make the repository asynchronous, then back it with a real store — change the
  interface first and let the compiler find every call site.
- Add `PATCH /games/:id` with a partial body.
- Add a field to `Game` and follow the errors through DTO mapping, parser and
  seed data.
- Compute query parameters from the route key the way path params are computed.
