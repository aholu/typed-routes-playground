/**
 * Every failure the API can produce, listed in one place.
 *
 * Adding a variant here immediately breaks toHttpFailure below. That is the
 * point: a new failure mode cannot silently fall through to a generic 500.
 */

export type ApiError =
  | { readonly kind: 'not_found'; readonly resource: string; readonly id: string }
  | { readonly kind: 'invalid_input'; readonly field: string; readonly message: string }
  | { readonly kind: 'conflict'; readonly message: string }

export type HttpErrorStatus = 404 | 409 | 422

export type HttpFailure = {
  readonly status: HttpErrorStatus
  readonly body: { readonly error: ApiError['kind']; readonly detail: string }
}

export const toHttpFailure = (error: ApiError): HttpFailure => {
  switch (error.kind) {
    case 'not_found':
      return { status: 404, body: { error: error.kind, detail: `${error.resource} "${error.id}" not found` } }
    case 'invalid_input':
      return { status: 422, body: { error: error.kind, detail: `${error.field}: ${error.message}` } }
    case 'conflict':
      return { status: 409, body: { error: error.kind, detail: error.message } }
    default: {
      // Exhaustive check: if a new ApiError variant is added and not handled
      // above, `error` is no longer `never` and this assignment fails to compile.
      const exhaustiveCheck: never = error
      return exhaustiveCheck
    }
  }
}
