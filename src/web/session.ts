const SESSION_ENDPOINT = '/api/session'

export const CSRF_HEADER = 'X-Skills-UI-CSRF'
export const SESSION_REQUIRED_HEADER = 'X-Skills-UI-Session-Required'

export interface LocalSession {
  csrfToken: string
}

export class SessionBootstrapError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SessionBootstrapError'
  }
}

let sessionPromise: Promise<LocalSession> | undefined

async function responseErrorMessage(response: Response): Promise<string> {
  const body = await response.text()
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: unknown }
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error
    } catch {
      // Plain text responses are already suitable user-facing fallbacks.
    }
    if (body.trim()) return body.trim()
  }
  return response.statusText || 'Unable to establish a local UI session'
}

async function bootstrapSession(): Promise<LocalSession> {
  const response = await fetch(SESSION_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    throw new SessionBootstrapError(response.status, await responseErrorMessage(response))
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new SessionBootstrapError(500, 'The local service returned an invalid session response')
  }

  const csrfToken = (body as { csrfToken?: unknown } | null)?.csrfToken
  if (typeof csrfToken !== 'string' || !csrfToken.trim()) {
    throw new SessionBootstrapError(500, 'The local service returned an invalid session response')
  }

  return { csrfToken }
}

export function getLocalSession(): Promise<LocalSession> {
  if (!sessionPromise) {
    const pending = bootstrapSession()
    sessionPromise = pending
    void pending.catch(() => {
      if (sessionPromise === pending) sessionPromise = undefined
    })
  }
  return sessionPromise
}

export async function invalidateLocalSession(session: LocalSession): Promise<void> {
  const current = sessionPromise
  if (!current) return

  try {
    if (await current === session && sessionPromise === current) sessionPromise = undefined
  } catch {
    if (sessionPromise === current) sessionPromise = undefined
  }
}

export function resetLocalSession(): void {
  sessionPromise = undefined
}
