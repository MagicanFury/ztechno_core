import 'dotenv/config'
import http from 'http'
import crypto from 'crypto'
import { ZCryptoService } from '../crypto_service'

/**
 * Update a remote Docker container via the V2 Secure API
 * @param  packagename - The package/image name
 * @param port - The port number
 * @param console - Optional logger
 * @returns Promise resolving to success status and message
 */
export function updateDocker(packagename: string, port: string|number, console?: {log: any, error: any}): Promise<{success: boolean, message?: string, err?: string}> {
  return new Promise((resolve, reject) => {
    const secretKey = process.env.ZTECHNO_API_SECRET

    if (!secretKey) {
      console.log("\x1b[31m✗ Error: ZTECHNO_API_SECRET environment variable not set\x1b[0m")
      return reject(new Error('ZTECHNO_API_SECRET environment variable not set'))
    }

    // Generate timestamp and signature
    const timestamp = Date.now().toString()
    const payload = timestamp + packagename + port + ''
    const signature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex')

    console?.log("\x1b[32m" + `[Updating Remote Docker via V2 Secure API]`)

    const options = {
      hostname: ZCryptoService.decrypt({ iv: '00d1df14932d0e6b5d064cceb037f586', encryptedData: '05b9d826539fe2cbdf7d7ecccfe57635' }),
      port: 7998,
      path: `/v2/images/${packagename}/update?port=${port}`,
      method: 'GET',
      headers: {
        'x-timestamp': timestamp,
        'x-signature': signature
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const response = JSON.parse(data)
          console?.log("\x1b[36mStatus Code:", res.statusCode, "\x1b[0m")
          console?.log("\x1b[34mResponse:", JSON.stringify(response, null, 2), "\x1b[0m")
          if (response.success) {
            console?.log("\x1b[32m✓", response.message, "\x1b[0m")
            resolve(response)
          } else {
            console?.log("\x1b[31m✗ Error:", response.err, "\x1b[0m")
            resolve(response)
          }
        } catch (err) {
          console?.log("\x1b[31mFailed to parse response:", data, "\x1b[0m")
          console?.error(err)
          reject(err)
        }
      })
    })

    req.on('error', (err) => {
      console?.log("\x1b[31m✗ Request failed:", err.message, "\x1b[0m")
      reject(err)
    })

    req.end()
  })
}

// Run if executed directly (node docker-update.js or npm run docker-update)
if (require.main === module) {
  const arg = process.argv.slice(2)[0]
  if (!arg || !arg.includes(':')) {
    console.log("\x1b[31m✗ Usage: node docker-update.js <packagename>:<port>\x1b[0m")
    process.exit(1)
  }
  const [packagename, port] = arg.split(':')
  updateDocker(packagename, port, console).catch(() => process.exit(1))
}

module.exports = { updateDocker }