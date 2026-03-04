import express = require('express')
import { ZUser } from './all-types'
import { ZUserService } from './user_service'
export {}

declare global {
  var userService: ZUserService
	namespace Express {
		interface Request {
			user?: ZUser
      cookies?: {[key: string]: any}
		}
	}
}