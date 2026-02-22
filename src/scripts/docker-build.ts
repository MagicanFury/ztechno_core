#!/usr/bin/env node
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

// ANSI color helpers
const red = (msg: string) => `\x1b[31m${msg}\x1b[0m`
const green = (msg: string) => `\x1b[32m${msg}\x1b[0m`
const cyan = (msg: string) => `\x1b[36m${msg}\x1b[0m`

interface PkgJson {
  name?: string
  config?: { awsAccountId?: string; [key: string]: any }
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
 * Build a Docker image tagged as <awsAccountId>/<packagename>:latest
 * @param opt.packagename - Override the image name (defaults to package.json name)
 * @param opt.awsAccountId - Override the AWS Account ID (defaults to package.json config.awsAccountId)
 * @param opt.tag - Override the tag (defaults to "latest")
 * @param opt.context - Docker build context path (defaults to ".")
 */
export function dockerBuild(opt?: { packagename?: string; awsAccountId?: string; tag?: string; context?: string }): void {
  const pkg = loadPackageJson()
  const packagename = opt?.packagename || pkg.name
  const awsAccountId = opt?.awsAccountId || pkg.config?.awsAccountId || process.env.AWS_ACCOUNT_ID
  const tag = opt?.tag || 'latest'
  const context = opt?.context || '.'

  if (!packagename) {
    throw new Error('Missing package name. Set "name" in package.json or pass --name.')
  }
  if (!awsAccountId) {
    throw new Error('Missing AWS Account ID. Set "config.awsAccountId" in package.json or AWS_ACCOUNT_ID env var.')
  }

  const image = `${awsAccountId}/${packagename}:${tag}`
  const cmd = `docker build -t ${image} ${context}`

  console.log(green(`[Docker Build]`))
  console.log(cyan(`> ${cmd}`))
  execSync(cmd, { stdio: 'inherit' })
  console.log(green(`✓ Built ${image}`))
}

const USAGE = `
Usage:
  ztechno-docker-build [options]

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
      "awsAccountId": "00028463827"
    }
  }
`.trim()

if (require.main === module) {
  try {
    const args = process.argv.slice(2)

    if (args.includes('--help') || args.includes('-h')) {
      console.log(USAGE)
      process.exit(0)
    }

    const getArg = (flag: string) => {
      const idx = args.indexOf(flag)
      return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined
    }

    dockerBuild({
      packagename: getArg('--name'),
      awsAccountId: getArg('--account'),
      tag: getArg('--tag'),
      context: getArg('--context'),
    })
  } catch (err) {
    console.error(red(`✗ Error: ${err.message}`))
    process.exit(1)
  }
}
