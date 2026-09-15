import type { GameDto } from '../domain/game.js'

type Uuid = `${string}-${string}-${string}-${string}-${string}`

export type SeedData = Record<Uuid, Omit<GameDto, 'uuid'>>

export const rawGames = {
  'c3b88a1e-8e41-4c12-92a0-43f5509d311d': { name: 'Tomb Raider: Definitive Edition', release_year: 2014 },
  '1652bbd0-aa93-434b-8993-4f7a1e952fd3': { name: 'Need for Speed: Rivals', release_year: 2014 },
  'd4e21a89-9a21-4034-8cbb-12f5a67104bc': { name: 'Mortal Kombat X', release_year: 2015 },
  '5e10d294-118c-428a-bf90-e55d21a12093': { name: 'Watch Dogs 2', release_year: 2016 },
  '7a309f83-3c92-41bf-a81d-847e192f1b88': { name: 'Just Cause 3: XXL Edition', release_year: 2018 },
  'a823f4a1-098e-4f32-bc12-9c31fa78129e': { name: 'Mafia: Definitive Edition', release_year: 2026 },
} as const satisfies SeedData
