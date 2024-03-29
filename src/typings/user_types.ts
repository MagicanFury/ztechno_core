export type ZUser = {
  user_id: number
  email: string
  session: string
  role: string | null
  admin: 0 | 1
  updated_at: any
  created_at: any
}

export type ZRequiredUserColumns = {
  email: string
  role: string | null
  pass: string
  admin: 0 | 1
}
export type ZUserCredentials = {
  email: string
  pass: string
}

export type ZUserSession = {
  session: string
}