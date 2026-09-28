import { err, ok, type Result } from './result.js'
import type { ApiError } from './errors.js'

/** A JSON body is `unknown` until proven to be an object with string keys. */
export const asJsonObject = (input: unknown): Result<Record<string, unknown>, ApiError> =>
  typeof input === 'object' && input !== null && !Array.isArray(input)
    ? ok(input as Record<string, unknown>)
    : err({ kind: 'invalid_input', field: 'body', message: 'expected a JSON object' })

export const normalizeName = (name: string): string => name.trim()

export const validateName = (raw: unknown): Result<string, ApiError> => {
  if (typeof raw !== 'string' || normalizeName(raw).length === 0) {
    return err({ kind: 'invalid_input', field: 'name', message: 'expected a non-empty string' })
  }
  return ok(normalizeName(raw))
}
