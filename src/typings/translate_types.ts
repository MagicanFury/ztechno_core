import { ZSqlService } from "../sql_service"
// import {} from "dom-parser"

export type Dom =  {} & Node
export type Node = {
  getAttribute: (attr: string) => string;
  getElementsByTagName: (tag: string) => Node[];
  getElementsByClassName: (cls: string) => Node[];
  getElementById: (id: string) => Node;
  getElementsByName: (name: string) => Node[];
  nodeType: string;
  nodeName: string;
  childNodes: Node[];
  firstChild: Node;
  lastChild: Node;
  parentNode: Node;
  attributes: any[];
  innerHTML: string;
  outerHTML: string;
  textContent: string;

  text: string;
}
export type ZNodeText = {
  text: string;
} & Node
export type TranslateData = { value: string; meta?: { prefix: string; suffix: string } }
export type dbTranslationRow = { lang: string; key: string; value: string }

export type ATranslateLang = {lang: string, text: string}

export type TranslateServiceOptions = {
  sqlService: ZSqlService
  googleApiKey: string
  languages?: ATranslateLang[]
  defaultLang?: string
  sourceLang?: string
  surpressErrors?: boolean
  log?: (data, context) => any
  verbose?: (data, context) => any
  maxRetries?: number
  retryDelay?: number
  fallbackText?: string
}

// Custom error types for better error handling
export class TranslateError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message)
    this.name = 'TranslateError'
  }
}

export class HtmlEntityError extends TranslateError {
  constructor(code: string, text: string) {
    super(`Cannot recognize character code="${code}" for text="${text}"`, 'HTML_ENTITY_ERROR', { code, text })
  }
}

export class ApiTranslationError extends TranslateError {
  constructor(originalError: any, text: string, lang: string) {
    super(`Translation API failed for text="${text}" to language="${lang}"`, 'API_TRANSLATION_ERROR', { originalError, text, lang })
  }
}

export class DatabaseError extends TranslateError {
  constructor(originalError: any, operation: string) {
    super(`Database operation failed: ${operation}`, 'DATABASE_ERROR', { originalError, operation })
  }
}

export class ValidationError extends TranslateError {
  constructor(field: string, value: any) {
    super(`Invalid ${field}: ${value}`, 'VALIDATION_ERROR', { field, value })
  }
}