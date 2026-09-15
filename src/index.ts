import { DB_PATH, PORT } from './config.js'
import { createServer, type IncomingMessage } from 'node:http'
import { bodyParsers, createHandlers, successStatus } from './api/handlers.js'
import { createRouter } from './http/router.js'
import { GameRepository } from './repository/game-repository.js'

const MAX_BODY_BYTES = 1_048_576 // 1 MiB — arbitrary but bounded, unlike no limit at all

class PayloadTooLargeError extends Error {}

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new PayloadTooLargeError(`body exceeds ${MAX_BODY_BYTES} bytes`)
    chunks.push(chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

const repository = new GameRepository(DB_PATH)
const route = createRouter(createHandlers(repository), bodyParsers, successStatus)

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    try {
      const result = await route({
        method: request.method ?? 'GET',
        path: url.pathname,
        rawBody: await readBody(request),
      })

      response.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(result.body, null, 2))
      console.log(`${request.method} ${url.pathname} -> ${result.status}`)
    } catch (cause) {
      if (cause instanceof PayloadTooLargeError) {
        console.warn(`${request.method} ${url.pathname} -> 413`, cause.message)
        response.writeHead(413, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: 'payload_too_large', detail: cause.message }))
        return
      }

      // Last resort: an invariant broke somewhere. Never leave the socket open.
      console.error(`${request.method} ${url.pathname} -> 500`, cause)
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: 'internal', detail: 'unexpected failure' }))
    }
  })()
})

server.listen(PORT, () => {
  console.log(`listening on http://localhost:${PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.closeAllConnections()
    server.close(() => {
      repository.close()
      process.exit(0)
    })
  })
}
