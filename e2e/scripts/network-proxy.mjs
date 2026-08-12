import { lookup } from 'node:dns/promises'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { connect as connectTls } from 'node:tls'

const LISTEN_HOST = '0.0.0.0'
const LISTEN_PORT = 8080

// These are the only remote endpoints used by the recorded GitHub source
// acceptance cases. Keep this exact-host list narrow; do not accept suffixes.
const ALLOWED_HOSTS = new Set([
  'api.github.com',
  'codeload.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'raw.githubusercontent.com',
])
const TLS_IDENTITY_CACHE_MS = 5 * 60 * 1000
const tlsIdentityCache = new Map()

function rejectTunnel(socket, status, reason) {
  if (socket.destroyed) return
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

function parseAuthority(authority) {
  if (typeof authority !== 'string' || authority.length > 300) return null
  const match = /^([A-Za-z0-9.-]+):([0-9]{1,5})$/.exec(authority)
  if (!match) return null

  const hostname = match[1].toLowerCase().replace(/\.$/, '')
  const port = Number.parseInt(match[2], 10)
  if (!hostname || hostname.includes('..') || port !== 443) return null
  return { hostname, port }
}

function normalizeAddress(address) {
  const zoneIndex = address.indexOf('%')
  return (zoneIndex === -1 ? address : address.slice(0, zoneIndex)).toLowerCase()
}

function isPublicIpv4(address) {
  const octets = address.split('.').map(value => Number.parseInt(value, 10))
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false
  }

  const [a, b, c] = octets
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false

  // Documentation-only ranges are never valid GitHub destinations.
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function isSyntheticIpv4(address) {
  const octets = address.split('.').map(value => Number.parseInt(value, 10))
  return octets.length === 4
    && octets.every(value => Number.isInteger(value) && value >= 0 && value <= 255)
    && octets[0] === 198
    && (octets[1] === 18 || octets[1] === 19)
}

function isPublicIpv6(address) {
  const normalized = normalizeAddress(address)
  if (normalized === '::' || normalized === '::1') return false
  const firstGroup = Number.parseInt(normalized.split(':', 1)[0] || '0', 16)
  if (!Number.isInteger(firstGroup)) return false
  if ((firstGroup & 0xfe00) === 0xfc00) return false
  if ((firstGroup & 0xffc0) === 0xfe80) return false
  if ((firstGroup & 0xff00) === 0xff00) return false
  if (normalized.startsWith('2001:db8:')) return false
  if (normalized.startsWith('::ffff:')) {
    return isPublicIpv4(normalized.slice('::ffff:'.length))
  }
  return true
}

async function resolveAllowedAddresses(hostname) {
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  return addresses
    .filter(entry => entry.family === 4
      ? isPublicIpv4(entry.address) || isSyntheticIpv4(entry.address)
      : entry.family === 6 && isPublicIpv6(entry.address))
    .sort((left, right) => left.family - right.family)
    .slice(0, 8)
}

function verifyTlsEndpoint(target, address) {
  return new Promise(resolve => {
    const socket = connectTls({
      host: address.address,
      port: target.port,
      family: address.family,
      servername: target.hostname,
      rejectUnauthorized: true,
      ALPNProtocols: ['http/1.1'],
    })
    let settled = false
    const finish = (verified, errorCode = '') => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ verified, errorCode })
    }

    socket.setTimeout(20_000, () => finish(false, 'TIMEOUT'))
    socket.once('secureConnect', () => finish(socket.authorized, socket.authorizationError ?? ''))
    socket.once('error', error => finish(false, error.code ?? 'UNKNOWN'))
  })
}

async function verifyAllowedTlsEndpoint(target, address) {
  const cacheKey = `${target.hostname}|${address.address}`
  const verifiedAt = tlsIdentityCache.get(cacheKey)
  if (typeof verifiedAt === 'number' && Date.now() - verifiedAt < TLS_IDENTITY_CACHE_MS) {
    return { verified: true, errorCode: '' }
  }

  let result = { verified: false, errorCode: 'UNKNOWN' }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = await verifyTlsEndpoint(target, address)
    if (result.verified) {
      tlsIdentityCache.set(cacheKey, Date.now())
      return result
    }
  }
  return result
}

function openUpstream(target, address) {
  return new Promise(resolve => {
    const socket = connect({ host: address.address, port: target.port, family: address.family })
    let settled = false
    const finish = (connected, errorCode = '') => {
      if (settled) return
      settled = true
      if (!connected) socket.destroy()
      resolve({ socket: connected ? socket : null, errorCode })
    }

    socket.setTimeout(20_000, () => finish(false, 'TIMEOUT'))
    socket.once('connect', () => finish(true))
    socket.once('error', error => finish(false, error.code ?? 'UNKNOWN'))
  })
}

const server = createServer((_request, response) => {
  response.writeHead(405, {
    Connection: 'close',
    'Content-Length': '0',
  })
  response.end()
})

server.on('connect', async (request, clientSocket, head) => {
  const target = parseAuthority(request.url)
  if (!target || !ALLOWED_HOSTS.has(target.hostname)) {
    rejectTunnel(clientSocket, 403, 'Forbidden')
    return
  }

  clientSocket.setTimeout(20_000, () => clientSocket.destroy())

  let addresses
  try {
    addresses = await resolveAllowedAddresses(target.hostname)
  } catch (error) {
    console.error(`proxy-resolve-error ${target.hostname} ${error.code ?? 'UNKNOWN'}`)
    rejectTunnel(clientSocket, 502, 'Bad Gateway')
    return
  }
  if (addresses.length === 0) {
    console.error(`proxy-resolve-rejected ${target.hostname}`)
    rejectTunnel(clientSocket, 502, 'Bad Gateway')
    return
  }

  let upstream = null
  for (const address of addresses) {
    if (clientSocket.destroyed) return

    const tlsResult = await verifyAllowedTlsEndpoint(target, address)
    if (!tlsResult.verified) {
      console.error(`proxy-tls-error ${target.hostname} ipv${address.family} ${tlsResult.errorCode || 'UNAUTHORIZED'}`)
      continue
    }

    let connectResult = { socket: null, errorCode: 'UNKNOWN' }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      connectResult = await openUpstream(target, address)
      if (connectResult.socket) {
        upstream = connectResult.socket
        break
      }
    }
    if (upstream) break
    console.error(`proxy-upstream-error ${target.hostname} ipv${address.family} ${connectResult.errorCode || 'UNKNOWN'}`)
  }

  if (!upstream) {
    if (!clientSocket.destroyed) rejectTunnel(clientSocket, 502, 'Bad Gateway')
    return
  }

  upstream.setTimeout(20_000, () => upstream.destroy())
  if (clientSocket.destroyed) {
    upstream.destroy()
    return
  }
  clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
  if (head.length > 0) upstream.write(head)
  upstream.pipe(clientSocket)
  clientSocket.pipe(upstream)

  upstream.once('error', () => clientSocket.destroy())
  clientSocket.once('error', () => upstream.destroy())
  clientSocket.once('close', () => upstream.destroy())
})

server.on('clientError', (_error, socket) => {
  if (!socket.destroyed) rejectTunnel(socket, 400, 'Bad Request')
})

server.maxConnections = 32
server.headersTimeout = 10_000
server.requestTimeout = 10_000

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5_000).unref()
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`proxy-ready ${LISTEN_HOST}:${LISTEN_PORT}`)
})
