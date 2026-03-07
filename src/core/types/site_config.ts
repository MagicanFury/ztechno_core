export type Coordinates = [number, number]

export type CompanyInfo = {
  company: string
  companyShort: string
  copyright: string
  kvk: string
  kvkUrl: string
  btwNr: string
  iban: string
  bankName: string
}

export type Address = {
  street: string
  city: string
  zipcode: string
  addressRegion: string
  country: string
  latLng: Coordinates
}

export type ContactInfo = {
  phone: string
  contact: string
  contactQuote: string
  mapsUrl: string
  whatsappUrl: string
}

export type SeoDefaults = {
  keywords: string
  description: string
  ogLocale: string
}

export type RenderContext = {
  startTimeStamp: number
  path: string
  ejsPath: string
  isProd: boolean
  projectsHtml: string
}

export type RenderData = {
  baseUrl: string
  company: CompanyInfo
  address: Address
  contact: ContactInfo
  seo: SeoDefaults
  context: RenderContext
}