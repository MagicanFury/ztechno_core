import { ZDom, ZNode, ZNodeText } from 'ztechno_core'
import { ZSqlService } from './sql_service'
const DomParser = require('dom-parser')
const translate = require('translate')

const htmlParser = new DomParser()

type TranslateData = { value: string; meta?: { prefix: string; suffix: string } }
type dbTranslationRow = { lang: string; key: string; value: string }

let instance: ZTranslateService | null = null

export class ZTranslateService {
  private localCache: { [lang: string]: { [key: string]: TranslateData } } = {}
  public surpressErrors: boolean = true

  public getLanguages() {
    return ['en', 'nl']
  }
  public getSourceLang() {
    return 'nl'
  }
  public getDefaultLang() {
    return 'nl'
  }

  constructor(private sql: ZSqlService) {
    this.getLanguages().map((lang) => (this.localCache[lang] = {}))
    setInterval(() => this.clearLocalCache(), 1000 * 60 * 60) // Every Hour
  }

  public static init(opt: { key: string }) {
    translate.key = opt.key
  }

  private codes: { [code: string]: string } = {
    [`&#39`]: `'`,
    [`&#34`]: `"`,
    [`&#8220`]: `“`,
    [`&#8221`]: `”`,
    [`&#169`]: `©`,
    [`&#174`]: `®`,
    [`&#8364`]: `€`,
    [`&#163`]: `£`,
    [`&#8482`]: `™`,
  }

  public getLang(cookies: { [key: string]: string }) {
    const defaultLang = this.getDefaultLang()
    const langKey = (cookies.lang || defaultLang).toLowerCase()
    const langs = this.getLanguages()
    if (!langs.includes(langKey)) {
      return defaultLang
    }
    return langKey
  }

  public async translateText(langOrReq: string | any, text: string): Promise<string> {
    const lang = typeof langOrReq === 'string' ? langOrReq : this.getLang(langOrReq.cookies)
    text = text.trim()
    if (text.length === 1) {
      return text
    }
    let replaceCount = 0
    while (text.includes('&#')) {
      const codeIndexStart = text.indexOf('&#')
      const first = text.substring(codeIndexStart)
      const codeLength = first.indexOf('') + 1
      const code = first.substring(0, codeLength)
      if (this.codes[code] === undefined) {
        throw new Error(`Cant recognize character code="${code}"\n for text=${text}\n\n`)
        // return text
      }
      text = text.substring(0, codeIndexStart) + this.codes[text] + text.substring(codeIndexStart + codeLength)
      // text = text.replace(code, codes[text])
      if (replaceCount++ > 1000) {
        throw new Error(`Replace Count > 1000!!! character code="${code}"\n for text=${text}\n\n`)
        // return text
      }
    }
    const localCached = this.checkLocalCache(text, lang)
    if (localCached !== false) {
      return localCached.value
    }
    const remoteCached = await this.fetch(text, lang)
    if (remoteCached !== false) {
      return remoteCached.value
    }
    let result: string
    try {
      result = await translate(text, {
        from: this.getSourceLang(),
        to: lang,
      })
    } catch (err) {
      result = '?'
    }
    await this.insert(text, lang, { value: result })
    return result
  }

  public async translateHtml(html: string, cookies: { lang: string, [key: string]: string }): Promise<string> {
    const lang = this.getLang(cookies)
    const defaultLang = this.getDefaultLang()
    const dom: ZDom = htmlParser.parseFromString(html)
    const htmlNodes: ZNode[] = dom.getElementsByTagName('html')
    const mainNodes: ZNode[] = dom.getElementsByTagName('main')
    const isView = htmlNodes.length === 0
    const domNode: ZNode = isView ? mainNodes[0] : htmlNodes[0]

    if (lang !== defaultLang) {
      const node: ZNode = isView ? domNode : domNode.getElementsByTagName('body')[0]
      const promises: Promise<any>[] = []
      this.translateHtmlRec(lang, node, promises)
      await Promise.all(promises)
    }
    const output = domNode ? domNode.outerHTML : html
    return output.startsWith(`<!DOCTYPE html>`) ? output : `<!DOCTYPE html>\r\n${output}`
  }

  private translateHtmlRec(lang: string, node: ZNode, promises: Promise<any>[], skipTranslate: boolean = false): void {
    if (node.getAttribute('notranslate') != null) {
      skipTranslate = true
    }
    if (node.nodeName === '#text') {
      const nodeText: ZNodeText = node
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
            if (!this.surpressErrors) {
              throw err // TODO: Find out if surpressing is better
            }
          }),
      )
      return
    }
    // const hasChildren = node.childNodes !== undefined
    for (const child of node.childNodes || []) {
      this.translateHtmlRec(lang, child, promises, skipTranslate)
    }
  }

  public async update(key: string, lang: string, data: TranslateData) {
    return await this.sql.query(
      `
      INSERT INTO translations
        (\`key\`, \`lang\`, \`value\`)
      VALUES
        (?, ?, ?)
      ON DUPLICATE KEY UPDATE value=?
    `,
      [key, lang, data.value, data.value],
    )
  }

  private checkLocalCache(key: string, lang: string): TranslateData | false {
    const hasLocal = !this.localCache[lang].hasOwnProperty(key)
    return hasLocal ? false : this.localCache[lang][key]
  }

  private insertLocalCache(key: string, lang: string, data: TranslateData): void {
    if (this.localCache[lang].hasOwnProperty(key)) {
      // console.warn(`Translations already cached!`, { key, lang, data})
      return
    }
    this.localCache[lang][key] = data
  }

  private clearLocalCache() {
    Object.keys(this.localCache).map((k) => {
      this.localCache[k] = {}
    })
  }

  private async fetch(key: string, lang: string): Promise<TranslateData | false> {
    const results = await this.sql.query(`SELECT \`value\` FROM translations WHERE \`lang\`=? AND \`key\`=?`, [lang, key])
    if (results.length > 0) {
      // api.query(`UPDATE translations SET last_used=CURRENT_TIMESTAMP WHERE \`lang\`=? AND \`key\`=?`, [lang, key])
      //   .catch(err => console.error(err))
      const { value } = results[0]
      this.insertLocalCache(key, lang, { value } as TranslateData)
      return { value } as TranslateData
    }
    return false
  }

  private async insert(key: string, lang: string, data: TranslateData) {
    await this.sql.query(`INSERT IGNORE INTO translations (\`key\`, \`lang\`, \`value\`) VALUES (?, ?, ?)`, [
      key,
      lang,
      data.value,
    ])
  }

  private fetchLang(lang: string): Promise<dbTranslationRow[]> {
    return this.sql.query(
      `SELECT \`key\`, \`lang\`, \`value\`, \`verified\`, \`created_at\` FROM translations WHERE \`lang\`=?`,
      [lang],
    )
  }

  public async fetchAllGrouped(): Promise<{ [key: string]: dbTranslationRow[] }> {
    const output: { [key: string]: dbTranslationRow[] } = {}
    const allTranslations = await this.fetchAll()
    allTranslations.map((translation) => {
      const { key } = translation
      if (!output.hasOwnProperty(key)) {
        output[key] = []
      }
      output[key].push(translation)
    })
    return output
  }

  private fetchAll(): Promise<dbTranslationRow[]> {
    return this.sql.query(`SELECT \`key\`, \`lang\`, \`value\`, \`verified\`, \`created_at\` FROM translations`)
  }

  static get(sqlService: ZSqlService): ZTranslateService {
    if (instance == null) {
      instance = new ZTranslateService(sqlService)
    }
    return instance
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
