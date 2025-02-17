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
}