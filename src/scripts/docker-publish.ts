#!/usr/bin/env node
import path from 'path'
import fs from 'fs'
import { dockerBuild } from './docker-build'
import { dockerPush } from './docker-push'
import { updateDocker } from './docker-update'

// ANSI color helpers
const red = (msg: string) => `\x1b[31m${msg}\x1b[0m`
const green = (msg: string) => `\x1b[32m${msg}\x1b[0m`
const cyan = (msg: string) => `\x1b[36m${msg}\x1b[0m`

interface PkgJson {
  name?: string
  config?: { awsAccountId?: string; port?: string | number; volumes?: string | string[]; [key: string]: any }
  [key: string]: any
}

function loadPackageJson(): PkgJson {
  const pkgPath = path.join(process.cwd(), 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`No package.json found in ${process.cwd()}`)
  }
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
}

/**
 * Run the full Docker publish pipeline: build → push → update
 * All options are auto-detected from package.json and .env
 * @param opt.packagename - Override the image name
 * @param opt.awsAccountId - Override the AWS Account ID
 * @param opt.tag - Override the tag (defaults to "latest")
 * @param opt.context - Docker build context path (defaults to ".")
 * @param opt.port - Override the port for remote update
 * @param opt.volumes - Override volumes for remote update
 */
export async function dockerPublish(opt?: {
  packagename?: string
  awsAccountId?: string
  tag?: string
  context?: string
  port?: string | number
  volumes?: string[]
}): Promise<void> {
  const pkg = loadPackageJson()
  const packagename = opt?.packagename || pkg.name
  const awsAccountId = opt?.awsAccountId || pkg.config?.awsAccountId || process.env.AWS_ACCOUNT_ID
  const tag = opt?.tag || 'latest'

  console.log(cyan(`\n[Docker Publish Pipeline]`))
  console.log(cyan(`  Image: ${awsAccountId}/${packagename}:${tag}\n`))

  // Step 1: Build
  console.log(cyan(`── Step 1/3: Build ──`))
  dockerBuild({ packagename, awsAccountId, tag, context: opt?.context })

  // Step 2: Push
  console.log(cyan(`\n── Step 2/3: Push ──`))
  dockerPush({ packagename, awsAccountId, tag })

  // Step 3: Update remote
  console.log(cyan(`\n── Step 3/3: Update Remote ──`))
  const port = opt?.port || pkg.config?.port
  let volumes = opt?.volumes
  if (!volumes && pkg.config?.volumes) {
    volumes = Array.isArray(pkg.config.volumes)
      ? pkg.config.volumes
      : pkg.config.volumes.split(',').filter(Boolean)
  }

  if (!port) {
    console.log(green(`✓ Build & push complete. Skipping remote update (no port configured).`))
    return
  }

  await updateDocker({
    packagename: packagename!,
    port,
    volumes,
    c: console,
  })

  console.log(green(`\n✓ Publish pipeline complete!`))
}

const USAGE = `
Usage:
  ztechno-docker-publish [options]

Runs: docker build → docker push → remote update

Options:
  --name <name>       Override image name (default: package.json "name")
  --account <id>      Override AWS Account ID (default: package.json "config.awsAccountId")
  --tag <tag>         Override tag (default: "latest")
  --context <path>    Docker build context (default: ".")
  -h, --help          Show this help

package.json format:
  {
    "name": "my-image",
    "config": {
      "awsAccountId": "00028463827",
      "port": 3000,
      "volumes": ["/data:/app/data"]
    }
  }
`.trim()

if (require.main === module) {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    process.exit(0)
  }

  const getArg = (flag: string) => {
    const idx = args.indexOf(flag)
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined
  }

  dockerPublish({
    packagename: getArg('--name'),
    awsAccountId: getArg('--account'),
    tag: getArg('--tag'),
    context: getArg('--context'),
  }).catch(err => {
    console.error(red(`✗ Error: ${err.message}`))
    process.exit(1)
  })
}
