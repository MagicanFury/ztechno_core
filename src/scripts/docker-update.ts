#!/usr/bin/env node
import http from 'http'
import crypto from 'crypto'
import { config, DotenvConfigOutput } from 'dotenv'
import { ZCryptoService } from '../crypto_service'

// ANSI color helpers
const red = (msg: string) => `\x1b[31m${msg}\x1b[0m`
const green = (msg: string) => `\x1b[32m${msg}\x1b[0m`
const cyan = (msg: string) => `\x1b[36m${msg}\x1b[0m`
const blue = (msg: string) => `\x1b[34m${msg}\x1b[0m`

/** Default request timeout in milliseconds (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000

export interface DockerUpdateOptions {
  /** The package/image name */
  packagename: string
  /** The port number */
  port: string | number
  /** Optional array of volume mappings */
  volumes?: string[]
  /** Optional logger (defaults to silent) */
  c?: { log: (...args: any[]) => void; error: (...args: any[]) => void }
  /** Request timeout in ms (default: 30000) */
  timeout?: number
}

export interface DockerUpdateResult {
  success: boolean
  message?: string
  err?: string
}

/**
 * Update a remote Docker container via the V2 Secure API
 * @param opt - Update options
 * @returns Promise resolving to success status and message
 */
export function updateDocker(opt: DockerUpdateOptions): Promise<DockerUpdateResult> {
  return new Promise((resolve, reject) => {
    const { packagename, port, volumes, c, timeout = REQUEST_TIMEOUT_MS } = opt
    const secretKey = process.env.ZTECHNO_API_SECRET

    if (!secretKey) {
      c?.log(red('✗ Error: ZTECHNO_API_SECRET environment variable not set'))
      return reject(new Error('ZTECHNO_API_SECRET environment variable not set'))
    }

    // Generate timestamp and HMAC signature
    const timestamp = Date.now().toString()
    const volumesString = volumes && volumes.length > 0 ? volumes.join(',') : ''
    const payload = timestamp + packagename + port + volumesString
    const signature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex')

    c?.log(green(`[Updating Remote Docker via V2 Secure API]`))

    // Build query parameters with proper encoding
    const query = new URLSearchParams({ port: String(port) })
    if (volumesString) {
      query.set('volumes', volumesString)
    }

    const options: http.RequestOptions = {
      hostname: ZCryptoService.decrypt({ iv: '00d1df14932d0e6b5d064cceb037f586', encryptedData: '05b9d826539fe2cbdf7d7ecccfe57635' }),
      port: 7998,
      path: `/v2/images/${encodeURIComponent(packagename)}/update?${query}`,
      method: 'GET',
      timeout,
      headers: {
        'x-timestamp': timestamp,
        'x-signature': signature
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const response: DockerUpdateResult = JSON.parse(data)
          c?.log(cyan(`Status Code: ${res.statusCode}`))
          c?.log(blue(`Response: ${JSON.stringify(response, null, 2)}`))
          if (response.success) {
            c?.log(green(`✓ ${response.message}`))
          } else {
            c?.log(red(`✗ Error: ${response.err}`))
          }
          resolve(response)
        } catch (err) {
          c?.log(red(`Failed to parse response: ${data}`))
          c?.error(err)
          reject(err)
        }
      })
    })

    req.on('timeout', () => {
      req.destroy()
      const err = new Error(`Request timed out after ${timeout}ms`)
      c?.log(red(`✗ ${err.message}`))
      reject(err)
    })

    req.on('error', (err) => {
      c?.log(red(`✗ Request failed: ${err.message}`))
      reject(err)
    })

    req.end()
  })
}

/**
 * Parse options from a .env file in the current working directory.
 * Required keys: packagename, port, ZTECHNO_API_SECRET
 * Optional key: volumes (comma-separated)
 */
function loadOptionsFromEnv(): { packagename: string; port: string; volumes?: string[] } {
  const envPath = process.cwd() + '/.env'
  console.log(`Loading env from: ${envPath}`)

  const cfg: DotenvConfigOutput = config({ path: envPath })
  if (cfg.error) {
    throw cfg.error
  }

  const packagename = cfg.parsed?.packagename || process.env.packagename
  const port = cfg.parsed?.port || process.env.port
  const volumes = cfg.parsed?.volumes || process.env.volumes

  if (!packagename || !port) {
    throw new Error('Missing required .env variables: packagename and port')
  }

  return { packagename, port, volumes: volumes?.split(',').filter(Boolean) }
}

const USAGE = `
Usage:
  ztechno-docker-update <packagename>:<port>
  ztechno-docker-update                         (reads from .env file)

.env file format:
  ZTECHNO_API_SECRET=your_secret
  packagename=my-image
  port=3000
  volumes=/host/path:/container/path   (optional, comma-separated)
`.trim()

// Run if executed directly (node docker-update.js or npx ztechno-docker-update)
if (require.main === module) {
  const main = async () => {
    const arg = process.argv[2]

    if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      return
    }

    // No argument: load from .env
    if (arg === undefined) {
      const { packagename, port, volumes } = loadOptionsFromEnv()
      await updateDocker({ packagename, port, volumes, c: console })
      return
    }

    // Argument with colon: packagename:port
    if (arg.includes(':')) {
      const [packagename, port] = arg.split(':')
      if (!packagename || !port) {
        throw new Error(`Invalid argument "${arg}". Expected format: <packagename>:<port>`)
      }
      await updateDocker({ packagename, port, c: console })
      return
    }

    console.error(red(`✗ Invalid argument: "${arg}"`))
    console.log(USAGE)
    process.exit(1)
  }

  main().catch(err => {
    console.error(red(`✗ Error: ${err.message}`))
    process.exit(1)
  })
}