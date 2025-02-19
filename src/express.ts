
export function middleware() {
  return async (req: Express.Request, res: Express.Response, next: any) => {
    if (req.cookies === undefined) {
      throw new Error(`Module 'cookie-parser' isn't initialized. Please use app.use(cookieParser())`)
    }
    if (req.cookies.session === undefined) {
      return next()
    }
    const auth = await userService.auth({ session: req.cookies?.session })
    req.user = auth.user
    // TODO: Implement assertAdmin or something like that
    next()
  }
}