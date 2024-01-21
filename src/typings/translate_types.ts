import { ZSqlService } from "../sql_service";

export type ZDom = {} & ZNode
export type ZNode = {
  getAttribute: (attr: string) => string;
  getElementsByTagName: (tag: string) => ZNode[];
  getElementsByClassName: (cls: string) => ZNode[];
  getElementById: (id: string) => ZNode;
  getElementsByName: (name: string) => ZNode[];
  nodeType: string;
  nodeName: string;
  childNodes: ZNode[];
  firstChild: ZNode;
  lastChild: ZNode;
  parentNode: ZNode;
  attributes: any[];
  innerHTML: string;
  outerHTML: string;
  textContent: string;

  text: string;
}
export type ZNodeText = {
  text: string;
} & ZNode
export type TranslateData = { value: string; meta?: { prefix: string; suffix: string } }
export type dbTranslationRow = { lang: string; key: string; value: string }

export type ATranslateLang = {lang: string, text: string}

export type TranslateServiceOptions = {
  sqlService: ZSqlService
  googleApiKey: string
  languages?: ATranslateLang[]
  defaultLang?: string
  sourceLang?: string
}