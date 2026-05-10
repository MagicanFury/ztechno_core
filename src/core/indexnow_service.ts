const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
const INDEXNOW_BATCH_SIZE = 10_000

export interface IndexNowResult {
  success: boolean
  submitted: number
  urls: string[]
  status?: number
  error?: string
}

export interface IndexNowRouteLink {
  href: string
  noindex?: boolean
}

/**
 * IndexNow Service
 * 
 * Implements the IndexNow protocol to instantly notify search engines
 * (Bing, Yandex, Seznam, Naver) about new or updated URLs.
 * 
 * @see https://www.indexnow.org/documentation
 */
export interface IndexNowServiceOptions {
  /**
   * IndexNow API key - a unique identifier for your site, used to verify ownership and authorize URL submissions. You can generate a key yourself or use a random string. The key must be at least 32 characters long and should be kept secret to prevent unauthorized use.
   */
  key: string
  /**
   * The base URL of your website (e.g. https://www.example.com). This is used to construct absolute URLs for submission to IndexNow. It should include the protocol and should not have a trailing slash.
   */
  baseUrl: string
  /**
   * Optional custom endpoint for the IndexNow API. By default, the service will submit to https://api.indexnow.org/indexnow, which is supported by all major search engines. You can specify a different endpoint if you want to submit to a specific search engine or if you have a proxy setup.
   */
  endpoint?: string
}

/**
 * Service for notifying IndexNow-compatible search engines about URL updates.
 */
export class ZIndexNowService {

  constructor(private opt: IndexNowServiceOptions) {}

  /**
   * Returns the configured IndexNow API key.
   */
  public getIndexNowKey(): string {
    return this.opt.key
  }

  /**
   * Submit a single URL to IndexNow.
   */
  public async submitUrl(url: string): Promise<IndexNowResult> {
    return this.submitUrls([url])
  }

  /**
   * Submit multiple URLs to IndexNow in a single batch request.
   * The IndexNow API accepts up to 10,000 URLs per request.
   *
   * @param urls - Array of full or relative URLs
   */
  public async submitUrls(urls: string[]): Promise<IndexNowResult> {
    if (urls.length === 0) {
      return { success: true, submitted: 0, urls: [] }
    }

    const absoluteUrls = urls.map((url) => this.toAbsoluteUrl(url))
    const baseUrl = this.getBaseUrl()

    const body = {
      host: new URL(baseUrl).host,
      key: this.opt.key,
      keyLocation: `${baseUrl}/${this.opt.key}.txt`,
      urlList: absoluteUrls,
    }

    try {
      console.log(`[IndexNow] Submitting ${absoluteUrls.length} URL(s)...`)

      const response = await fetch(this.opt.endpoint || INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      })

      // IndexNow returns:
      // 200 = OK, URLs submitted
      // 202 = Accepted, URLs will be processed later
      // 400 = Bad request
      // 403 = Key not valid
      // 422 = URLs don't belong to host
      // 429 = Too many requests
      const success = response.status === 200 || response.status === 202

      if (success) {
        console.log(`[IndexNow] Submitted ${absoluteUrls.length} URL(s) (status: ${response.status})`)
      } else {
        const text = await response.text().catch(() => '')
        console.error(`[IndexNow] Failed with status ${response.status}: ${text}`)
      }

      return {
        success,
        submitted: absoluteUrls.length,
        urls: absoluteUrls,
        status: response.status,
      }
    } catch (err) {
      const message = (err as Error).message
      console.error(`[IndexNow] Error submitting URLs: ${message}`)
      return {
        success: false,
        submitted: 0,
        urls: absoluteUrls,
        error: message,
      }
    }
  }

  /**
   * Submit only the provided public site pages to IndexNow.
   */
  public async submitAllPages(routeLinks: IndexNowRouteLink[]): Promise<IndexNowResult> {
    const urls = routeLinks
      .filter((routeLink) => routeLink.href && !routeLink.noindex)
      .map((routeLink) => this.toAbsoluteUrl(routeLink.href))

    return this.submitUrls(urls)
  }

  /**
   * Submit every sitemap URL in batches accepted by IndexNow.
   */
  public async submitAllBatched(urls: string[]): Promise<IndexNowResult> {
    console.log(`[IndexNow] Collected ${urls.length} sitemap URL(s)`)

    if (urls.length <= INDEXNOW_BATCH_SIZE) {
      return this.submitUrls(urls)
    }

    let totalSubmitted = 0
    let lastStatus: number | undefined
    const allSubmittedUrls: string[] = []

    for (let index = 0; index < urls.length; index += INDEXNOW_BATCH_SIZE) {
      const batch = urls.slice(index, index + INDEXNOW_BATCH_SIZE)
      const result = await this.submitUrls(batch)
      if (!result.success) {
        return {
          success: false,
          submitted: totalSubmitted,
          urls: allSubmittedUrls,
          status: result.status,
          error: result.error,
        }
      }
      totalSubmitted += result.submitted
      lastStatus = result.status
      allSubmittedUrls.push(...result.urls)
    }

    return {
      success: true,
      submitted: totalSubmitted,
      urls: allSubmittedUrls,
      status: lastStatus,
    }
  }

  private getBaseUrl(): string {
    return this.opt.baseUrl.replace(/\/+$/, '')
  }

  private toAbsoluteUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    const normalizedPath = url.startsWith('/') ? url : `/${url}`
    return `${this.getBaseUrl()}${normalizedPath}`
  }
}
