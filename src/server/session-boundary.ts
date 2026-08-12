import { randomBytes, timingSafeEqual } from 'crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

export const LOOPBACK_HOST = '127.0.0.1'
export const SESSION_COOKIE_NAME = 'skills_ui_session'
export const CSRF_HEADER_NAME = 'X-Skills-UI-CSRF'
export const SESSION_REQUIRED_HEADER = 'X-Skills-UI-Session-Required'

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const MAX_SESSIONS = 256
const SAFE_METHODS = new Set(['GET', 'HEAD'])

interface SessionRecord {
  csrfToken: string
  expiresAt: number
}

export interface LocalSessionBoundary {
  securityHeaders: RequestHandler
  requireExpectedHost: RequestHandler
  bootstrapSession: RequestHandler
  requireApiSession: RequestHandler
}

export interface LocalSessionBoundaryOptions {
  authority: string
  now?: () => number
  randomToken?: () => string
}

function headerCount(req: Request, name: string): number {
  let count = 0
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLowerCase() === name.toLowerCase()) count += 1
  }
  return count
}

function cookieValue(req: Request, name: string): string | undefined {
  if (headerCount(req, 'cookie') > 1) return undefined
  const cookie = req.get('cookie')
  if (!cookie) return undefined

  let found: string | undefined
  for (const pair of cookie.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 0) continue
    if (pair.slice(0, separator).trim() !== name) continue
    if (found !== undefined) return undefined
    found = pair.slice(separator + 1).trim()
  }
  return found
}

function constantTimeTokenMatch(received: string | undefined, expected: string): boolean {
  if (!received || !CSRF_TOKEN_PATTERN.test(received)) return false
  const receivedBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer)
}

function isJsonRequest(req: Request): boolean {
  const contentType = req.get('content-type')
  if (!contentType) return false
  return contentType.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

function reject(res: Response, status: number, error: string): void {
  res.setHeader(SESSION_REQUIRED_HEADER, '1')
  res.status(status).json({ error })
}

export function createLocalSessionBoundary(
  options: LocalSessionBoundaryOptions
): LocalSessionBoundary {
  const expectedOrigin = `http://${options.authority}`
  const now = options.now ?? Date.now
  const randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'))
  const sessions = new Map<string, SessionRecord>()

  function pruneSessions(): void {
    const currentTime = now()
    for (const [id, session] of sessions) {
      if (session.expiresAt <= currentTime) sessions.delete(id)
    }
    while (sessions.size >= MAX_SESSIONS) {
      const oldest = sessions.keys().next().value as string | undefined
      if (!oldest) break
      sessions.delete(oldest)
    }
  }

  function validOrigin(req: Request): boolean {
    return headerCount(req, 'origin') === 1 && req.get('origin') === expectedOrigin
  }

  function validFetchMetadata(req: Request): boolean {
    const site = req.get('sec-fetch-site')
    return site === undefined || site === 'same-origin'
  }

  function currentSession(req: Request): SessionRecord | undefined {
    const id = cookieValue(req, SESSION_COOKIE_NAME)
    if (!id || !SESSION_ID_PATTERN.test(id)) return undefined
    const session = sessions.get(id)
    if (!session) return undefined
    if (session.expiresAt <= now()) {
      sessions.delete(id)
      return undefined
    }
    return session
  }

  return {
    securityHeaders: (_req, res, next) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; "
          + "form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; "
          + "object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'"
      )
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
      res.setHeader('Referrer-Policy', 'no-referrer')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('X-Frame-Options', 'DENY')
      next()
    },

    requireExpectedHost: (req, res, next) => {
      if (headerCount(req, 'host') !== 1 || req.get('host') !== options.authority) {
        res.status(421).json({ error: 'Request target is not accepted' })
        return
      }
      next()
    },

    bootstrapSession: (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Vary', 'Origin, Sec-Fetch-Site')
      if (!validOrigin(req) || !validFetchMetadata(req) || !isJsonRequest(req)) {
        reject(res, 403, 'Local UI session could not be established')
        return
      }

      pruneSessions()
      let sessionId = cookieValue(req, SESSION_COOKIE_NAME)
      let session = sessionId && SESSION_ID_PATTERN.test(sessionId)
        ? sessions.get(sessionId)
        : undefined

      if (!session || session.expiresAt <= now()) {
        sessionId = randomToken()
        const csrfToken = randomToken()
        if (!SESSION_ID_PATTERN.test(sessionId) || !CSRF_TOKEN_PATTERN.test(csrfToken)) {
          throw new Error('Session token generator returned an invalid token')
        }
        session = { csrfToken, expiresAt: now() + SESSION_TTL_MS }
        sessions.set(sessionId, session)
      }

      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${sessionId}; Path=/api; HttpOnly; SameSite=Strict`
      )
      res.status(200).json({ csrfToken: session.csrfToken })
    },

    requireApiSession: (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Vary', 'Origin, Sec-Fetch-Site')

      if (req.method === 'OPTIONS') {
        reject(res, 403, 'Local UI session is required')
        return
      }

      const session = currentSession(req)
      if (!session) {
        reject(res, 401, 'Local UI session is required')
        return
      }

      if (
        headerCount(req, CSRF_HEADER_NAME) !== 1
        || !constantTimeTokenMatch(req.get(CSRF_HEADER_NAME), session.csrfToken)
      ) {
        reject(res, 403, 'Local UI session is required')
        return
      }

      if (!SAFE_METHODS.has(req.method)) {
        if (!validOrigin(req) || !validFetchMetadata(req) || !isJsonRequest(req)) {
          reject(res, 403, 'Local UI session is required')
          return
        }
      }

      next()
    },
  }
}
