# typed-routes-playground

A toy HTTP API where the route table is the single source of truth: handler
signatures, path parameters and response shapes are all computed from it by the
type system.

> **This is a sandbox, not a library.** It exists to play with TypeScript as a
> design tool. Storage is SQLite via the built-in `node:sqlite` module, there
> are no tests beyond `tsc --noEmit`, and nothing here is meant for production
> use.

No framework, no validation library, no ORM — just Node's built-in `http`, so
that every guarantee is visibly the work of the compiler rather than of a
dependency. The domain (a catalogue of Xbox games and their genres) is
deliberately boring.

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
curl -X PATCH localhost:3000/games/5e10d294-118c-428a-bf90-e55d21a12093 -d '{"releaseYear":2017}'
curl -X DELETE localhost:3000/games/5e10d294-118c-428a-bf90-e55d21a12093

curl localhost:3000/genres
curl -X POST localhost:3000/genres -d '{"name":"Role-Playing Game"}'   # slug derived: role-playing-game
curl -X PATCH localhost:3000/genres/908d4eb1-2c79-47c6-b432-d1d655587f33 -d '{"slug":"action-games"}'
curl -X DELETE localhost:3000/genres/908d4eb1-2c79-47c6-b432-d1d655587f33   # also unlinks it from games

# genreIds sets a game's genres; in a PATCH it replaces the whole set, [] clears it
curl -X POST localhost:3000/games -d '{"name":"Halo 5","releaseYear":2015,"genreIds":["b962b484-c997-422c-8054-aa6a3d2ac466"]}'
curl -X PATCH localhost:3000/games/5e10d294-118c-428a-bf90-e55d21a12093 -d '{"genreIds":[]}'

curl -i localhost:3000/games/not-a-uuid   # 422
curl -i localhost:3000/players            # 404
```

Writes persist across restarts in a local SQLite file (`DB_PATH`, defaults to
`games.db`). Each table is seeded from `src/repository/seed-data.ts` while it is
empty. The schema is versioned through `PRAGMA user_version`, and an older
database is migrated forward on startup (see `src/repository/database.ts`).

Games and genres are many-to-many through a `game_genres` link table, with
foreign keys on and `ON DELETE CASCADE` on both sides: deleting a game or a
genre removes its links, never the other side. A game response embeds its
genres; a game request refers to them by `genreIds`, and an id that does not
exist is a 422.

## The idea

One object type drives everything else:

```ts
export type Routes = {
  'GET /games': { response: readonly Game[] }
  'GET /games/:id': { response: Game }
  'POST /games': { body: NewGame; response: Game }
  'PATCH /games/:id': { body: PatchGame; response: Game }
  'DELETE /games/:id': { response: { readonly deleted: GameId } }
  'GET /genres': { response: readonly Genre[] }
  'GET /genres/:id': { response: Genre }
  'POST /genres': { body: NewGenre; response: Genre }
  'PATCH /genres/:id': { body: PatchGenre; response: Genre }
  'DELETE /genres/:id': { response: { readonly deleted: GenreId } }
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
- **Ids are branded.** `GameId` and `GenreId` are `string`s at runtime but
  unreachable without `parseGameId`/`parseGenreId`, so the repository cannot be
  queried with unvalidated input — or with a genre id where a game id belongs.
- **Seed links are checked.** The game-to-genre seed map is keyed by the seed
  game ids and holds seed genre slugs, both as literal types, so a typo is a
  compile error.
- **Failure is a value.** `Result<T, E>` forces a check before `value` can be
  read, and `ApiError` maps to status codes under an exhaustiveness check.
- **One deliberate hole, contained.** The dispatch loop in `src/http/router.ts`
  needs a cast, because a container cannot express a per-key relation between a
  route and a function signature. Three unsafe lines, fully typed surface
  around them.

## Layout

```
src/
  domain/      Game and Genre models, branded ids, Result, ApiError — no HTTP in here
  repository/  Schema, migrations and seeding; SQLite-backed stores behind async interfaces
  api/         Route table, computed handler types, handlers
  http/        Dispatch loop and Node server adapter
```

## Things left to try

- Add a field to `Game` and follow the errors through DTO mapping, parser and
  seed data.
- Compute query parameters from the route key the way path params are computed.
