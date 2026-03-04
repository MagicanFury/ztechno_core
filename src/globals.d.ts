import express = require('express')
import { ZUser } from './core/types/user_types'
import { ZUserService } from './core/user_service'
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