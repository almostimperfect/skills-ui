import type { Express } from 'express'
import request, { type Test } from 'supertest'
import { CSRF_HEADER_NAME } from '../../src/server/session-boundary.js'

export const TEST_AUTHORITY = '127.0.0.1:3456'
export const TEST_ORIGIN = `http://${TEST_AUTHORITY}`

export async function authenticatedRequest(app: Express) {
  const agent = request.agent(app)
  const bootstrap = await agent
    .post('/api/session')
    .set('Host', TEST_AUTHORITY)
    .set('Origin', TEST_ORIGIN)
    .set('Sec-Fetch-Site', 'same-origin')
    .set('Content-Type', 'application/json')
    .send({})

  if (bootstrap.status !== 200 || typeof bootstrap.body.csrfToken !== 'string') {
    throw new Error(`Could not establish synthetic test session (${bootstrap.status})`)
  }

  const csrfToken = bootstrap.body.csrfToken as string
  const safeHeaders = <T extends Test>(test: T): T => test
    .set('Host', TEST_AUTHORITY)
    .set(CSRF_HEADER_NAME, csrfToken) as T
  const unsafeHeaders = <T extends Test>(test: T): T => safeHeaders(test)
    .set('Origin', TEST_ORIGIN)
    .set('Sec-Fetch-Site', 'same-origin')
    .set('Content-Type', 'application/json') as T

  return {
    csrfToken,
    get: (path: string) => safeHeaders(agent.get(path)),
    post: (path: string) => unsafeHeaders(agent.post(path)),
    patch: (path: string) => unsafeHeaders(agent.patch(path)),
    delete: (path: string) => unsafeHeaders(agent.delete(path)),
  }
}
