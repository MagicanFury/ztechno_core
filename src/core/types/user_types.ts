// Core user fields that are always required
export type ZUserCore = {
  user_id: number
  email: string
  session: string
  role: string | null
  admin: 0 | 1
  updated_at: any
  created_at: any
}

// Default user type (for backward compatibility)
export type ZUser = ZUserCore

// Extended user type that projects can use
export interface ZUserExtended extends ZUserCore {
  username?: string
  first_name?: string
  last_name?: string
  avatar_url?: string
  bio?: string
  is_active?: 0 | 1
  email_verified?: 0 | 1
  last_login?: any
}

// Core required fields for user creation
export type ZRequiredUserColumns = {
  email: string
  role: string | null
  pass: string
  admin: 0 | 1
}

// Extensible required columns type
export type ZRequiredUserColumnsExtended<T = {}> = ZRequiredUserColumns & Partial<T>

export type ZUserCredentials = {
  email: string
  pass: string
}

export type ZUserSession = {
  session: string
}

// Configuration for custom table schema
export type ZUserTableConfig = {
  tableName?: string
  customColumns?: { [columnName: string]: string } // column name -> SQL definition
  customIndexes?: string[] // array of index definitions
}