#!/usr/bin/env node
import http from 'http'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
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
 * Read the consumer's package.json from the current working directory.
 * Returns null if not found or unreadable.
 */
function loadPackageJson(): { name?: string; config?: { port?: string | number; volumes?: string }; [key: string]: any } | null {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    if (!fs.existsSync(pkgPath)) return null
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Auto-detect options from .env and/or package.json in the current working directory.
 * 
 * Resolution order for each field:
 *   1. .env / environment variable
 *   2. package.json (name → packagename, config.port → port, config.volumes → volumes)
 * 
 * Required: packagename, port, ZTECHNO_API_SECRET (env only)
 * Optional: volumes (comma-separated)
 */
function loadOptionsFromEnv(): { packagename: string; port: string; volumes?: string[] } {
  // Load .env file
  const envPath = path.join(process.cwd(), '.env')
  const cfg: DotenvConfigOutput = config({ path: envPath })
  if (cfg.error && cfg.error.message && !cfg.error.message.includes('ENOENT')) {
    throw cfg.error
  }

  // Load package.json as fallback
  const pkg = loadPackageJson()

  const packagename = cfg.parsed?.packagename || process.env.packagename || pkg?.name
  const port = cfg.parsed?.port || process.env.port || (pkg?.config?.port != null ? String(pkg.config.port) : undefined)
  const volumesRaw = cfg.parsed?.volumes || process.env.volumes || pkg?.config?.volumes

  if (pkg) {
    console.log(`Detected package.json: ${pkg.name || '(unnamed)'}`)
  }

  if (!packagename) {
    throw new Error('Missing packagename. Set it in .env, environment, or package.json "name".')
  }
  if (!port) {
    throw new Error('Missing port. Set it in .env, environment, or package.json "config.port".')
  }

  return { packagename, port, volumes: volumesRaw?.split(',').filter(Boolean) }
}

const USAGE = `
Usage:
  ztechno-docker-update <packagename>:<port>
  ztechno-docker-update                         (auto-detect from .env / package.json)

Auto-detection priority:
  1. .env file      → packagename, port, volumes, ZTECHNO_API_SECRET
  2. package.json   → "name" as packagename, "config.port", "config.volumes"

.env file format:
  ZTECHNO_API_SECRET=your_secret
  packagename=my-image
  port=3000
  volumes=/host/path:/container/path   (optional, comma-separated)

package.json format:
  {
    "name": "my-image",
    "config": {
      "port": 3000,
      "volumes": "/host/path:/container/path"
    }
  }
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