import express = require('express')
import userTypes = require('./typings/user_types')
import userService = require('./user_service')
export {}

declare global {
  var userService: userService.ZUserService
	namespace Express {
		interface Request {
			user?: userTypes.ZUser
      cookies?: {[key: string]: any}
		}
	}
}