const DEFAULT_PORT = 3000
const MAX_PORT = 65535

/**
 * Environment variables are the same trust boundary as a request body: strings
 * of unknown content. Unlike request errors, a bad config cannot be handled at
 * runtime — so this throws and stops the process instead of returning a Result.
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
