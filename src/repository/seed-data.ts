import type { GameDto } from '../domain/game.js'
import type { GenreDto } from '../domain/genre.js'

type Uuid = `${string}-${string}-${string}-${string}-${string}`

export type SeedData = {
  readonly games: Record<Uuid, Omit<GameDto, 'uuid'>>
  readonly genres: Record<Uuid, Omit<GenreDto, 'uuid'>>
  /** Game uuid -> slugs of its genres. */
  readonly gameGenres: Partial<Record<Uuid, readonly string[]>>
}

const rawGames = {
  'c3b88a1e-8e41-4c12-92a0-43f5509d311d': { name: 'Tomb Raider: Definitive Edition', release_year: 2014 },
  '1652bbd0-aa93-434b-8993-4f7a1e952fd3': { name: 'Need for Speed: Rivals', release_year: 2014 },
  'd4e21a89-9a21-4034-8cbb-12f5a67104bc': { name: 'Mortal Kombat X', release_year: 2015 },
  '5e10d294-118c-428a-bf90-e55d21a12093': { name: 'Watch Dogs 2', release_year: 2016 },
  '7a309f83-3c92-41bf-a81d-847e192f1b88': { name: 'Just Cause 3: XXL Edition', release_year: 2018 },
  'a823f4a1-098e-4f32-bc12-9c31fa78129e': { name: 'Mafia: Definitive Edition', release_year: 2026 },
} as const satisfies SeedData['games']

const rawGenres = {
  '908d4eb1-2c79-47c6-b432-d1d655587f33': { name: 'Action', slug: 'action' },
  '6c8b5416-ddab-4dc9-aa26-cbd78499d158': { name: 'Adventure', slug: 'adventure' },
  '81895d28-565c-4f59-a84d-814647e9ff5f': { name: 'Racing', slug: 'racing' },
  'a16a8583-3b86-4966-af70-59fbcc30895b': { name: 'Fighting', slug: 'fighting' },
  'a3981d4c-3035-46bf-9594-2f3c0f08cd05': { name: 'Open World', slug: 'open-world' },
  'b962b484-c997-422c-8054-aa6a3d2ac466': { name: 'Shooter', slug: 'shooter' },
} as const satisfies SeedData['genres']

type SeedGenreSlug = (typeof rawGenres)[keyof typeof rawGenres]['slug']

/**
 * Keys are checked against rawGames and values against rawGenres, so a typo in
 * either is a compile error rather than a silently missing link.
 */
const rawGameGenres = {
  'c3b88a1e-8e41-4c12-92a0-43f5509d311d': ['action', 'adventure'],
  '1652bbd0-aa93-434b-8993-4f7a1e952fd3': ['racing', 'open-world'],
  'd4e21a89-9a21-4034-8cbb-12f5a67104bc': ['fighting'],
  '5e10d294-118c-428a-bf90-e55d21a12093': ['action', 'adventure', 'open-world'],
  '7a309f83-3c92-41bf-a81d-847e192f1b88': ['action', 'open-world', 'shooter'],
  'a823f4a1-098e-4f32-bc12-9c31fa78129e': ['action', 'adventure', 'shooter'],
} as const satisfies { readonly [K in keyof typeof rawGames]?: readonly SeedGenreSlug[] }

export const seedData: SeedData = { games: rawGames, genres: rawGenres, gameGenres: rawGameGenres }
