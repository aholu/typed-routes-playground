import { PORT } from './config.js'
import { createServer, type IncomingMessage } from 'node:http'
import { bodyParsers, createHandlers, successStatus } from './api/handlers.js'
import { createRouter } from './http/router.js'
import { GameRepository } from './repository/game-repository.js'

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk as Buffer))
  }
  return Buffer.concat(chunks).toString('utf8')
}

const repository = new GameRepository()
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
