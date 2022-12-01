import { ZMailService } from "./mail_service"
import { ZSqlService } from "./sql_service"
import { ZTranslateService } from "./translate_service"
import { ZUserService } from "./user_service"

export class ZEngineBase {

  public static mailService?: ZMailService
  public static sqlService?: ZSqlService
  public static translateService?: ZTranslateService
  public static userService?: ZUserService

  protected static start() {
    throw new Error(`Please Override ZEngineBase`)
  }

}