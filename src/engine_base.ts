import { ZMailService } from "./mail_service"
import { ZSQLService } from "./sql_service"
import { ZTranslateService } from "./translate_service"
import { ZUserService } from "./user_service"

export class ZEngineBase {

  public static mailService?: ZMailService
  public static sqlService?: ZSQLService
  public static translateService?: ZTranslateService
  public static userService?: ZUserService

  protected static start(): any {
    throw new Error(`Please Override ZEngineBase`)
  }

}