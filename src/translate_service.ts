import { ZSQLService } from './sql_service'
import { TranslateData, dbTranslationRow, ATranslateLang, TranslateServiceOptions, TranslateError, HtmlEntityError, ApiTranslationError, DatabaseError, ValidationError } from './typings'
import { parseFromString, Node } from './vendor/dom-parser/dist'
import translate from 'translate'

export class ZTranslateService {

  private localCache: { [lang: string]: { [key: string]: TranslateData } } = {}
  private get sql(): ZSQLService { return this.opt.sqlService }

  public surpressErrors: boolean = true
  private maxRetries: number = 3
  private retryDelay: number = 1000
  private fallbackText: string = '?'

  public getLanguages(): ATranslateLang[] { return this.opt.languages || [{ lang: 'en', text: 'English' }, { lang: 'nl', text: 'Nederlands' }] }
  public getSourceLang(): string { return this.opt.sourceLang || 'en' }
  public getDefaultLang(): string { return this.opt.defaultLang || 'en' }

  constructor(private opt: TranslateServiceOptions) {
    if (!opt.googleApiKey) {
      throw new ValidationError('googleApiKey', opt.googleApiKey)
    }
    if (!opt.sqlService) {
      throw new ValidationError('sqlService', opt.sqlService)
    }

    translate.key = opt.googleApiKey
    this.surpressErrors = opt.surpressErrors ?? true
    this.maxRetries = opt.maxRetries ?? 3
    this.retryDelay = opt.retryDelay ?? 1000
    this.fallbackText = opt.fallbackText ?? '?'
    
    this.getLanguages().map((lang) => (this.localCache[lang.lang] = {}))
    setInterval(() => this.clearLocalCache(), 1000 * 60 * 60) // Every Hour
  }

  private codes: { [code: string]: string } = {
    // Quotes and apostrophes
    [`&#39;`]: `'`,
    [`&#34;`]: `"`,
    [`&#8220;`]: `"`,
    [`&#8221;`]: `"`,
    [`&#8216;`]: `'`,
    [`&#8217;`]: `'`,
    [`&#8218;`]: `‚`,
    [`&#8222;`]: `„`,
    [`&#171;`]: `«`,
    [`&#187;`]: `»`,
    [`&#8249;`]: `‹`,
    [`&#8250;`]: `›`,
    
    // Currency symbols
    [`&#169;`]: `©`,
    [`&#174;`]: `®`,
    [`&#8364;`]: `€`,
    [`&#163;`]: `£`,
    [`&#165;`]: `¥`,
    [`&#162;`]: `¢`,
    [`&#8482;`]: `™`,
    [`&#36;`]: `$`,
    
    // Mathematical and special symbols
    [`&#8211;`]: `–`,
    [`&#8212;`]: `—`,
    [`&#8230;`]: `…`,
    [`&#8226;`]: `•`,
    [`&#8594;`]: `→`,
    [`&#8592;`]: `←`,
    [`&#8593;`]: `↑`,
    [`&#8595;`]: `↓`,
    [`&#215;`]: `×`,
    [`&#247;`]: `÷`,
    [`&#177;`]: `±`,
    [`&#8804;`]: `≤`,
    [`&#8805;`]: `≥`,
    [`&#8800;`]: `≠`,
    [`&#8734;`]: `∞`,
    [`&#176;`]: `°`,
    [`&#8240;`]: `‰`,
    [`&#8224;`]: `†`,
    [`&#8225;`]: `‡`,
    [`&#167;`]: `§`,
    [`&#182;`]: `¶`,
    
    // Accented characters
    [`&#192;`]: `À`,
    [`&#193;`]: `Á`,
    [`&#194;`]: `Â`,
    [`&#195;`]: `Ã`,
    [`&#196;`]: `Ä`,
    [`&#197;`]: `Å`,
    [`&#198;`]: `Æ`,
    [`&#199;`]: `Ç`,
    [`&#200;`]: `È`,
    [`&#201;`]: `É`,
    [`&#202;`]: `Ê`,
    [`&#203;`]: `Ë`,
    [`&#204;`]: `Ì`,
    [`&#205;`]: `Í`,
    [`&#206;`]: `Î`,
    [`&#207;`]: `Ï`,
    [`&#208;`]: `Ð`,
    [`&#209;`]: `Ñ`,
    [`&#210;`]: `Ò`,
    [`&#211;`]: `Ó`,
    [`&#212;`]: `Ô`,
    [`&#213;`]: `Õ`,
    [`&#214;`]: `Ö`,
    [`&#216;`]: `Ø`,
    [`&#217;`]: `Ù`,
    [`&#218;`]: `Ú`,
    [`&#219;`]: `Û`,
    [`&#220;`]: `Ü`,
    [`&#221;`]: `Ý`,
    [`&#222;`]: `Þ`,
    [`&#223;`]: `ß`,
    [`&#224;`]: `à`,
    [`&#225;`]: `á`,
    [`&#226;`]: `â`,
    [`&#227;`]: `ã`,
    [`&#228;`]: `ä`,
    [`&#229;`]: `å`,
    [`&#230;`]: `æ`,
    [`&#231;`]: `ç`,
    [`&#232;`]: `è`,
    [`&#233;`]: `é`,
    [`&#234;`]: `ê`,
    [`&#235;`]: `ë`,
    [`&#236;`]: `ì`,
    [`&#237;`]: `í`,
    [`&#238;`]: `î`,
    [`&#239;`]: `ï`,
    [`&#240;`]: `ð`,
    [`&#241;`]: `ñ`,
    [`&#242;`]: `ò`,
    [`&#243;`]: `ó`,
    [`&#244;`]: `ô`,
    [`&#245;`]: `õ`,
    [`&#246;`]: `ö`,
    [`&#248;`]: `ø`,
    [`&#249;`]: `ù`,
    [`&#250;`]: `ú`,
    [`&#251;`]: `û`,
    [`&#252;`]: `ü`,
    [`&#253;`]: `ý`,
    [`&#254;`]: `þ`,
    [`&#255;`]: `ÿ`,
    
    // Common spaces and breaks
    [`&#160;`]: ` `,  // Non-breaking space
    [`&#173;`]: `­`,  // Soft hyphen
    [`&#8203;`]: ``,  // Zero-width space
    
    // Punctuation
    [`&#161;`]: `¡`,
    [`&#191;`]: `¿`,
    [`&#183;`]: `·`,
    [`&#184;`]: `¸`,
    
    // Fractions
    [`&#188;`]: `¼`,
    [`&#189;`]: `½`,
    [`&#190;`]: `¾`,
    [`&#8531;`]: `⅓`,
    [`&#8532;`]: `⅔`,
    [`&#8533;`]: `⅕`,
    [`&#8534;`]: `⅖`,
    [`&#8535;`]: `⅗`,
    [`&#8536;`]: `⅘`,
    [`&#8537;`]: `⅙`,
    [`&#8538;`]: `⅚`,
    [`&#8539;`]: `⅛`,
    [`&#8540;`]: `⅜`,
    [`&#8541;`]: `⅝`,
    [`&#8542;`]: `⅞`,
    
    // Greek letters (common ones)
    [`&#945;`]: `α`,
    [`&#946;`]: `β`,
    [`&#947;`]: `γ`,
    [`&#948;`]: `δ`,
    [`&#949;`]: `ε`,
    [`&#950;`]: `ζ`,
    [`&#951;`]: `η`,
    [`&#952;`]: `θ`,
    [`&#953;`]: `ι`,
    [`&#954;`]: `κ`,
    [`&#955;`]: `λ`,
    [`&#956;`]: `μ`,
    [`&#957;`]: `ν`,
    [`&#958;`]: `ξ`,
    [`&#959;`]: `ο`,
    [`&#960;`]: `π`,
    [`&#961;`]: `ρ`,
    [`&#963;`]: `σ`,
    [`&#964;`]: `τ`,
    [`&#965;`]: `υ`,
    [`&#966;`]: `φ`,
    [`&#967;`]: `χ`,
    [`&#968;`]: `ψ`,
    [`&#969;`]: `ω`,
    
    // Uppercase Greek letters
    [`&#913;`]: `Α`,
    [`&#914;`]: `Β`,
    [`&#915;`]: `Γ`,
    [`&#916;`]: `Δ`,
    [`&#917;`]: `Ε`,
    [`&#918;`]: `Ζ`,
    [`&#919;`]: `Η`,
    [`&#920;`]: `Θ`,
    [`&#921;`]: `Ι`,
    [`&#922;`]: `Κ`,
    [`&#923;`]: `Λ`,
    [`&#924;`]: `Μ`,
    [`&#925;`]: `Ν`,
    [`&#926;`]: `Ξ`,
    [`&#927;`]: `Ο`,
    [`&#928;`]: `Π`,
    [`&#929;`]: `Ρ`,
    [`&#931;`]: `Σ`,
    [`&#932;`]: `Τ`,
    [`&#933;`]: `Υ`,
    [`&#934;`]: `Φ`,
    [`&#935;`]: `Χ`,
    [`&#936;`]: `Ψ`,
    [`&#937;`]: `Ω`,
    
    // Additional common symbols
    [`&#8378;`]: `₪`,
    [`&#8381;`]: `₽`,
    [`&#8377;`]: `₹`,
    [`&#164;`]: `¤`,
    [`&#166;`]: `¦`,
    [`&#168;`]: `¨`,
    [`&#170;`]: `ª`,
    [`&#172;`]: `¬`,
    [`&#175;`]: `¯`,
    [`&#178;`]: `²`,
    [`&#179;`]: `³`,
    [`&#185;`]: `¹`,
    [`&#186;`]: `º`,
    
    // Card suits and misc symbols
    [`&#9824;`]: `♠`,
    [`&#9827;`]: `♣`,
    [`&#9829;`]: `♥`,
    [`&#9830;`]: `♦`,
    [`&#9733;`]: `★`,
    [`&#9734;`]: `☆`,
    [`&#9742;`]: `☎`,
    [`&#9749;`]: `☕`,
    [`&#9786;`]: `☺`,
    [`&#9787;`]: `☻`,
    [`&#9788;`]: `☼`,
    [`&#9792;`]: `♀`,
    [`&#9794;`]: `♂`,
    [`&#10084;`]: `❤`,
  }

  public getLang(cookies: { [key: string]: string }): string {
    try {
      const defaultLang = this.getDefaultLang()
      const langKey = (cookies?.lang || defaultLang).toLowerCase()
      const foundLang = this.getLanguages().find(l => l.lang === langKey)
      return (foundLang === undefined) ? defaultLang : foundLang.lang
    } catch (error) {
      this.logError(new ValidationError('cookies', cookies), 'getLang')
      return this.getDefaultLang()
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private logError(error: Error, context: string): void {
    if (this.opt.log) {
      this.opt.log(error, { context, timestamp: new Date().toISOString() })
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    let lastError: Error
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        this.logError(error, `${operationName} - Attempt ${attempt}/${maxRetries}`)
        
        if (attempt < maxRetries) {
          await this.sleep(this.retryDelay * attempt) // Exponential backoff
        }
      }
    }
    
    throw lastError
  }

  public async translateText(langOrReq: string | any, text: string): Promise<string> {
    try {
      // Input validation
      if (!text || typeof text !== 'string') {
        throw new ValidationError('text', text)
      }

      const lang = typeof langOrReq === 'string' ? langOrReq : this.getLang(langOrReq.cookies)
      text = text.trim()
      
      if (text.length === 0) {
        return text
      }
      
      if (text.length === 1) {
        return text
      }

      // Process HTML entities with better error handling
      text = await this.processHtmlEntities(text)

      // Check local cache
      const localCached = this.checkLocalCache(text, lang)
      if (localCached !== false) {
        return localCached.value
      }

      // Check remote cache
      const remoteCached = await this.fetch(text, lang)
      if (remoteCached !== false) {
        return remoteCached.value
      }

      // Perform translation with retry logic
      let result: string
      try {
        result = await this.retryOperation(async () => {
          return await translate(text, {
            from: this.getSourceLang(),
            to: lang,
          })
        }, 'translateText')
      } catch (err) {
        const translationError = new ApiTranslationError(err, text, lang)
        this.logError(translationError, 'translateText')
        
        if (!this.surpressErrors) {
          throw translationError
        }
        result = this.fallbackText
      }

      // Save translation to cache
      try {
        await this.insert(text, lang, { value: result })
      } catch (err) {
        this.logError(new DatabaseError(err, 'insert translation'), 'translateText')
        // Don't throw here, translation still succeeded
      }

      return result
    } catch (error) {
      if (error instanceof TranslateError) {
        throw error
      }
      
      const wrappedError = new TranslateError(`Unexpected error in translateText: ${error.message}`, 'UNEXPECTED_ERROR', { originalError: error })
      this.logError(wrappedError, 'translateText')
      
      if (!this.surpressErrors) {
        throw wrappedError
      }
      
      return this.fallbackText
    }
  }

  private async processHtmlEntities(text: string): Promise<string> {
    let replaceCount = 0
    const maxReplacements = 1000

    while (text.includes('&#')) {
      const codeIndexStart = text.indexOf('&#')
      const first = text.substring(codeIndexStart)
      const semicolonIndex = first.indexOf(';')
      
      if (semicolonIndex === -1) {
        // No closing semicolon found, break to avoid infinite loop
        break
      }
      
      const codeLength = semicolonIndex + 1
      const code = first.substring(0, codeLength)
      
      if (this.codes[code] === undefined) {
        const entityError = new HtmlEntityError(code, text)
        this.logError(entityError, 'processHtmlEntities')
        
        if (!this.surpressErrors) {
          throw entityError
        }
        // Skip this entity and continue
        text = text.substring(0, codeIndexStart) + code + text.substring(codeIndexStart + codeLength)
        break
      }
      
      text = text.substring(0, codeIndexStart) + this.codes[code] + text.substring(codeIndexStart + codeLength)
      
      if (replaceCount++ > maxReplacements) {
        const loopError = new TranslateError(
          `HTML entity replacement exceeded maximum count (${maxReplacements})`,
          'MAX_REPLACEMENTS_EXCEEDED',
          { code, text, replaceCount }
        )
        this.logError(loopError, 'processHtmlEntities')
        
        if (!this.surpressErrors) {
          throw loopError
        }
        break
      }
    }
    
    return text
  }

  public async translateHtml(html: string, cookies: { lang: string } & { [key: string]: string }): Promise<string> {
    try {
      if (!html || typeof html !== 'string') {
        throw new ValidationError('html', html)
      }

      if (!cookies) {
        throw new ValidationError('cookies', cookies)
      }

      const lang = this.getLang(cookies)
      const srcLang = this.getSourceLang()
      
      let dom: any
      try {
        dom = parseFromString(html)
      } catch (error) {
        const parseError = new TranslateError('Failed to parse HTML', 'HTML_PARSE_ERROR', { error, html })
        this.logError(parseError, 'translateHtml')
        
        if (!this.surpressErrors) {
          throw parseError
        }
        return html
      }

      const htmlNodes: Node[] = dom.getElementsByTagName('html')
      const mainNodes: Node[] = dom.getElementsByTagName('main')
      const isView = htmlNodes.length === 0
      const domNode: Node = isView ? mainNodes[0] : htmlNodes[0]

      if (lang !== srcLang && domNode) {
        const node: Node = isView ? domNode : domNode.getElementsByTagName('body')[0]
        if (node) {
          const promises: Promise<any>[] = []
          this.translateHtmlRec(lang, node, promises)
          
          try {
            await Promise.all(promises)
          } catch (error) {
            this.logError(new TranslateError('Failed to translate HTML nodes', 'HTML_TRANSLATION_ERROR', { error }), 'translateHtml')
            if (!this.surpressErrors) {
              throw error
            }
          }
        }
      }

      const output = domNode ? domNode.outerHTML : html
      return output.startsWith(`<!DOCTYPE html>`) ? output : `<!DOCTYPE html>\r\n${output}`
    } catch (error) {
      if (error instanceof TranslateError) {
        throw error
      }
      
      const wrappedError = new TranslateError(`Unexpected error in translateHtml: ${error.message}`, 'UNEXPECTED_ERROR', { originalError: error })
      this.logError(wrappedError, 'translateHtml')
      
      if (!this.surpressErrors) {
        throw wrappedError
      }
      
      return html
    }
  }

  private translateHtmlRec(lang: string, node: Node, promises: Promise<any>[], skipTranslate: boolean = false): void {
    try {
      if (this.opt.verbose) this.opt.verbose(node.nodeName, node)
      
      if (node.getAttribute && node.getAttribute('notranslate') != null) {
        skipTranslate = true
      }
      
      // Skip HTML comments
      if (node.nodeName === '#comment') {
        return
      }
      
      if (node.nodeName === '#text') {
        const nodeText: Node = node
        const text = nodeText.text.replace(/[\r|\n|\r\n]+/g, ' ').replace(/\s\s+/g, ' ')
        const value = text.trim()
        const meta = {
          prefix: genSpaces(text.length - text.trimStart().length),
          suffix: genSpaces(text.length - text.trimEnd().length),
        }
        
        if (skipTranslate === true || text.length === 0 || !strContainsLetters(text)) {
          node.text = meta.prefix + text + meta.suffix
          return
        }
        
        promises.push(
          this.translateText(lang, value)
            .then((translatedText: string) => {
              node.text = meta.prefix + translatedText + meta.suffix
            })
            .catch((err) => {
              node.text = text
              this.logError(err, 'translateHtmlRec')
              if (!this.surpressErrors) {
                throw err
              }
            }),
        )
        return
      }
      
      // Process child nodes safely
      if (node.childNodes && Array.isArray(node.childNodes)) {
        for (const child of node.childNodes) {
          this.translateHtmlRec(lang, child, promises, skipTranslate)
        }
      }
    } catch (error) {
      this.logError(new TranslateError(`Error processing HTML node: ${error.message}`, 'HTML_NODE_ERROR', { error, nodeName: node?.nodeName }), 'translateHtmlRec')
      if (!this.surpressErrors) {
        throw error
      }
    }
  }

  public async update(key: string, lang: string, data: TranslateData) {
    try {
      if (!key || !lang || !data) {
        throw new ValidationError('update parameters', { key, lang, data })
      }

      const res = await this.retryOperation(async () => {
        return await this.sql.query(`
          INSERT INTO translations
            (\`key\`, \`lang\`, \`value\`)
          VALUES
            (:key, :lang, :value)
          ON DUPLICATE KEY UPDATE value=:value
        `, { key, lang, value: data.value })
      }, 'update translation')

      if (res.affectedRows) {
        this.insertLocalCache(key, lang, data)
      }
      return res
    } catch (error) {
      const dbError = new DatabaseError(error, 'update translation')
      this.logError(dbError, 'update')
      throw dbError
    }
  }

  private checkLocalCache(key: string, lang: string): TranslateData | false {
    try {
      if (!key || !lang || !this.localCache[lang]) {
        return false
      }
      const hasLocal = !this.localCache[lang].hasOwnProperty(key)
      return hasLocal ? false : this.localCache[lang][key]
    } catch (error) {
      this.logError(new TranslateError('Local cache check failed', 'CACHE_ERROR', { error, key, lang }), 'checkLocalCache')
      return false
    }
  }

  private insertLocalCache(key: string, lang: string, data: TranslateData): void {
    try {
      if (!key || !lang || !data) {
        return
      }
      if (!this.localCache[lang]) {
        this.localCache[lang] = {}
      }
      this.localCache[lang][key] = data
    } catch (error) {
      this.logError(new TranslateError('Local cache insertion failed', 'CACHE_ERROR', { error, key, lang }), 'insertLocalCache')
    }
  }

  private clearLocalCache(): void {
    try {
      Object.keys(this.localCache).map((k) => {
        this.localCache[k] = {}
      })
    } catch (error) {
      this.logError(new TranslateError('Failed to clear local cache', 'CACHE_ERROR', { error }), 'clearLocalCache')
    }
  }

  private async fetch(key: string, lang: string): Promise<TranslateData | false> {
    try {
      if (!key || !lang) {
        return false
      }

      const results = await this.retryOperation(async () => {
        return await this.sql.query<any>(`SELECT \`value\` FROM translations WHERE \`lang\`=? AND \`key\`=CONVERT(? USING utf8mb3)`, [lang, key])
      }, 'fetch translation')

      if (results.length > 0) {
        const { value } = results[0]
        const data = { value } as TranslateData
        this.insertLocalCache(key, lang, data)
        return data
      }
      return false
    } catch (error) {
      const dbError = new DatabaseError(error, 'fetch translation')
      this.logError(dbError, 'fetch')
      return false // Don't throw, let translation proceed
    }
  }

  private async insert(key: string, lang: string, data: TranslateData): Promise<void> {
    try {
      if (!key || !lang || !data) {
        throw new ValidationError('insert parameters', { key, lang, data })
      }

      await this.retryOperation(async () => {
        return await this.sql.query(`INSERT IGNORE INTO translations (\`key\`, \`lang\`, \`value\`) VALUES (?, ?, ?)`, [
          key,
          lang,
          data.value,
        ])
      }, 'insert translation')
    } catch (error) {
      const dbError = new DatabaseError(error, 'insert translation')
      this.logError(dbError, 'insert')
      throw dbError
    }
  }

  private async fetchLang(lang: string): Promise<dbTranslationRow[]> {
    try {
      if (!lang) {
        throw new ValidationError('lang', lang)
      }

      return await this.retryOperation(async () => {
        return await this.sql.query<any>(
          `SELECT \`key\`, \`lang\`, \`value\`, \`verified\`, \`created_at\` FROM translations WHERE \`lang\`=?`,
          [lang],
        )
      }, 'fetchLang')
    } catch (error) {
      const dbError = new DatabaseError(error, 'fetch language translations')
      this.logError(dbError, 'fetchLang')
      throw dbError
    }
  }

  public async fetchAllGrouped(): Promise<{ [key: string]: dbTranslationRow[] }> {
    try {
      const output: { [key: string]: dbTranslationRow[] } = {}
      const allTranslations = await this.fetchAll()
      
      allTranslations.forEach((translation) => {
        const { key } = translation
        if (!output.hasOwnProperty(key)) {
          output[key] = []
        }
        output[key].push(translation)
      })
      
      return output
    } catch (error) {
      const dbError = new DatabaseError(error, 'fetch all grouped translations')
      this.logError(dbError, 'fetchAllGrouped')
      throw dbError
    }
  }

  private async fetchAll(): Promise<dbTranslationRow[]> {
    try {
      return await this.retryOperation(async () => {
        return await this.sql.query<dbTranslationRow>(`SELECT \`key\`, \`lang\`, \`value\`, \`verified\`, \`created_at\` FROM translations`)
      }, 'fetchAll')
    } catch (error) {
      const dbError = new DatabaseError(error, 'fetch all translations')
      this.logError(dbError, 'fetchAll')
      throw dbError
    }
  }
}

function strContainsLetters(text: string): boolean {
  const regExp = /[a-zA-Z]/g
  return regExp.test(text)
}

function genSpaces(length: number): string {
  let output: string = ''
  for (let i = 0; i < length; i++) {
    output += ' '
  }
  return output
}
