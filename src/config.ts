const DEFAULT_PORT = 3000
const MAX_PORT = 65535

/**
 * PORT is the same trust boundary as a request body: a string of unknown
 * content that has to become a real number before anything else can use it.
 * Unlike a request error, a bad config cannot be handled at runtime — so
 * this throws and stops the process instead of returning a Result.
 */
export const parsePort = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_PORT

  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`invalid PORT: expected an integer 1-${MAX_PORT}, got "${raw}"`)
  }

  return port
}

export const PORT = parsePort(process.env.PORT)

/**
 * Path to the SQLite file backing the game store ('' falls back to a
 * default; ':memory:' works too). Unlike PORT, there's no meaningful parsing
 * to do on a path ahead of time — a bad one (a directory, an unwritable
 * location) still fails loudly, just later, when GameRepository opens it.
 */
export const DB_PATH = process.env.DB_PATH?.trim() || 'games.db'
