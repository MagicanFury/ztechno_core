import { ZSQLService } from './sql_service'
import { TranslateData, dbTranslationRow, ATranslateLang, TranslateServiceOptions, TranslateError, HtmlEntityError, ApiTranslationError, DatabaseError, ValidationError } from '../all-types'
import { parseFromString, Node } from '../vendor/dom-parser/dist'
import translate from 'translate'

export class ZTranslateService {

  private localCache: { [lang: string]: { [key: string]: TranslateData } } = {}
  private get sql(): ZSQLService { return this.opt.sqlService }

  public surpressErrors: boolean = true
  private maxRetries: number = 3
  private retryDelay: number = 1000
  private fallbackText: string = '?'

  public getLanguages(): ATranslateLang[] { return this.opt.languages || [{ lang: 'en', text: 'English' }, { lang: 'nl', text: 'Nederlands' }] }
  public getSourceLang(): string { return this.opt.sourceLang || 'en' }
  public getDefaultLang(): string { return this.opt.defaultLang || 'en' }

  constructor(private opt: TranslateServiceOptions) {
    if (!opt.googleApiKey) {
      throw new ValidationError('googleApiKey', opt.googleApiKey)
    }
    if (!opt.sqlService) {
      throw new ValidationError('sqlService', opt.sqlService)
    }

    translate.key = opt.googleApiKey
    this.surpressErrors = opt.surpressErrors ?? true
    this.maxRetries = opt.maxRetries ?? 3
    this.retryDelay = opt.retryDelay ?? 1000
    this.fallbackText = opt.fallbackText ?? '?'
    
    this.getLanguages().map((lang) => (this.localCache[lang.lang] = {}))
    setInterval(() => this.clearLocalCache(), 1000 * 60 * 60) // Every Hour
  }

  private codes: { [code: string]: string } = {
    // Quotes and apostrophes
    [`&#39;`]: `'`,
    [`&#34;`]: `"`,
    [`&#8220;`]: `"`,
    [`&#8221;`]: `"`,
    [`&#8216;`]: `'`,
    [`&#8217;`]: `'`,
    [`&#8218;`]: `‚`,
    [`&#8222;`]: `„`,
    [`&#171;`]: `«`,
    [`&#187;`]: `»`,
    [`&#8249;`]: `‹`,
    [`&#8250;`]: `›`,
    
    // Currency symbols
    [`&#169;`]: `©`,
    [`&#174;`]: `®`,
    [`&#8364;`]: `€`,
    [`&#163;`]: `£`,
    [`&#165;`]: `¥`,
    [`&#162;`]: `¢`,
    [`&#8482;`]: `™`,
    [`&#36;`]: `$`,
    
    // Mathematical and special symbols
    [`&#8211;`]: `–`,
    [`&#8212;`]: `—`,
    [`&#8230;`]: `…`,
    [`&#8226;`]: `•`,
    [`&#8594;`]: `→`,
    [`&#8592;`]: `←`,
    [`&#8593;`]: `↑`,
    [`&#8595;`]: `↓`,
    [`&#215;`]: `×`,
    [`&#247;`]: `÷`,
    [`&#177;`]: `±`,
    [`&#8804;`]: `≤`,
    [`&#8805;`]: `≥`,
    [`&#8800;`]: `≠`,
    [`&#8734;`]: `∞`,
    [`&#176;`]: `°`,
    [`&#8240;`]: `‰`,
    [`&#8224;`]: `†`,
    [`&#8225;`]: `‡`,
    [`&#167;`]: `§`,
    [`&#182;`]: `¶`,
    
    // Accented characters
    [`&#192;`]: `À`,
    [`&#193;`]: `Á`,
    [`&#194;`]: `Â`,
    [`&#195;`]: `Ã`,
    [`&#196;`]: `Ä`,
    [`&#197;`]: `Å`,
    [`&#198;`]: `Æ`,
    [`&#199;`]: `Ç`,
    [`&#200;`]: `È`,
    [`&#201;`]: `É`,
    [`&#202;`]: `Ê`,
    [`&#203;`]: `Ë`,
    [`&#204;`]: `Ì`,
    [`&#205;`]: `Í`,
    [`&#206;`]: `Î`,
    [`&#207;`]: `Ï`,
    [`&#208;`]: `Ð`,
    [`&#209;`]: `Ñ`,
    [`&#210;`]: `Ò`,
    [`&#211;`]: `Ó`,
    [`&#212;`]: `Ô`,
    [`&#213;`]: `Õ`,
    [`&#214;`]: `Ö`,
    [`&#216;`]: `Ø`,
    [`&#217;`]: `Ù`,
    [`&#218;`]: `Ú`,
    [`&#219;`]: `Û`,
    [`&#220;`]: `Ü`,
    [`&#221;`]: `Ý`,
    [`&#222;`]: `Þ`,
    [`&#223;`]: `ß`,
    [`&#224;`]: `à`,
    [`&#225;`]: `á`,
    [`&#226;`]: `â`,
    [`&#227;`]: `ã`,
    [`&#228;`]: `ä`,
    [`&#229;`]: `å`,
    [`&#230;`]: `æ`,
    [`&#231;`]: `ç`,
    [`&#232;`]: `è`,
    [`&#233;`]: `é`,
    [`&#234;`]: `ê`,
    [`&#235;`]: `ë`,
    [`&#236;`]: `ì`,
    [`&#237;`]: `í`,
    [`&#238;`]: `î`,
    [`&#239;`]: `ï`,
    [`&#240;`]: `ð`,
    [`&#241;`]: `ñ`,
    [`&#242;`]: `ò`,
    [`&#243;`]: `ó`,
    [`&#244;`]: `ô`,
    [`&#245;`]: `õ`,
    [`&#246;`]: `ö`,
    [`&#248;`]: `ø`,
    [`&#249;`]: `ù`,
    [`&#250;`]: `ú`,
    [`&#251;`]: `û`,
    [`&#252;`]: `ü`,
    [`&#253;`]: `ý`,
    [`&#254;`]: `þ`,
    [`&#255;`]: `ÿ`,
    
    // Common spaces and breaks
    [`&#160;`]: ` `,  // Non-breaking space
    [`&#173;`]: `­`,  // Soft hyphen
    [`&#8203;`]: ``,  // Zero-width space
    
    // Punctuation
    [`&#161;`]: `¡`,
    [`&#191;`]: `¿`,
    [`&#183;`]: `·`,
    [`&#184;`]: `¸`,
    
    // Fractions
    [`&#188;`]: `¼`,
    [`&#189;`]: `½`,
    [`&#190;`]: `¾`,
    [`&#8531;`]: `⅓`,
    [`&#8532;`]: `⅔`,
    [`&#8533;`]: `⅕`,
    [`&#8534;`]: `⅖`,
    [`&#8535;`]: `⅗`,
    [`&#8536;`]: `⅘`,
    [`&#8537;`]: `⅙`,
    [`&#8538;`]: `⅚`,
    [`&#8539;`]: `⅛`,
    [`&#8540;`]: `⅜`,
    [`&#8541;`]: `⅝`,
    [`&#8542;`]: `⅞`,
    
    // Greek letters (common ones)
    [`&#945;`]: `α`,
    [`&#946;`]: `β`,
    [`&#947;`]: `γ`,
    [`&#948;`]: `δ`,
    [`&#949;`]: `ε`,
    [`&#950;`]: `ζ`,
    [`&#951;`]: `η`,
    [`&#952;`]: `θ`,
    [`&#953;`]: `ι`,
    [`&#954;`]: `κ`,
    [`&#955;`]: `λ`,
    [`&#956;`]: `μ`,
    [`&#957;`]: `ν`,
    [`&#958;`]: `ξ`,
    [`&#959;`]: `ο`,
    [`&#960;`]: `π`,
    [`&#961;`]: `ρ`,
    [`&#963;`]: `σ`,
    [`&#964;`]: `τ`,
    [`&#965;`]: `υ`,
    [`&#966;`]: `φ`,
    [`&#967;`]: `χ`,
    [`&#968;`]: `ψ`,
    [`&#969;`]: `ω`,
    
    // Uppercase Greek letters
    [`&#913;`]: `Α`,
    [`&#914;`]: `Β`,
    [`&#915;`]: `Γ`,
    [`&#916;`]: `Δ`,
    [`&#917;`]: `Ε`,
    [`&#918;`]: `Ζ`,
    [`&#919;`]: `Η`,
    [`&#920;`]: `Θ`,
    [`&#921;`]: `Ι`,
    [`&#922;`]: `Κ`,
    [`&#923;`]: `Λ`,
    [`&#924;`]: `Μ`,
    [`&#925;`]: `Ν`,
    [`&#926;`]: `Ξ`,
    [`&#927;`]: `Ο`,
    [`&#928;`]: `Π`,
    [`&#929;`]: `Ρ`,
    [`&#931;`]: `Σ`,
    [`&#932;`]: `Τ`,
    [`&#933;`]: `Υ`,
    [`&#934;`]: `Φ`,
    [`&#935;`]: `Χ`,
    [`&#936;`]: `Ψ`,
    [`&#937;`]: `Ω`,
    
    // Additional common symbols
    [`&#8378;`]: `₪`,
    [`&#8381;`]: `₽`,
    [`&#8377;`]: `₹`,
    [`&#164;`]: `¤`,
    [`&#166;`]: `¦`,
    [`&#168;`]: `¨`,
    [`&#170;`]: `ª`,
    [`&#172;`]: `¬`,
    [`&#175;`]: `¯`,
    [`&#178;`]: `²`,
    [`&#179;`]: `³`,
    [`&#185;`]: `¹`,
    [`&#186;`]: `º`,
    
    // Card suits and misc symbols
    [`&#9824;`]: `♠`,
    [`&#9827;`]: `♣`,
    [`&#9829;`]: `♥`,
    [`&#9830;`]: `♦`,
    [`&#9733;`]: `★`,
    [`&#9734;`]: `☆`,
    [`&#9742;`]: `☎`,
    [`&#9749;`]: `☕`,
    [`&#9786;`]: `☺`,
    [`&#9787;`]: `☻`,
    [`&#9788;`]: `☼`,
    [`&#9792;`]: `♀`,
    [`&#9794;`]: `♂`,
    [`&#10084;`]: `❤`,
    
    // Arabic characters (U+0600 to U+06FF range)
    [`&#1536;`]: `؀`,  // Arabic Number Sign
    [`&#1537;`]: `؁`,  // Arabic Sign Sanah
    [`&#1538;`]: `؂`,  // Arabic Sign Safha
    [`&#1539;`]: `؃`,  // Arabic Sign Radi Allaahu Anhu
    [`&#1540;`]: `؄`,  // Arabic Sign Radi Allaahu Anha
    [`&#1541;`]: `؅`,  // Arabic Sign Radi Allaahu Anhum
    [`&#1542;`]: `؆`,  // Arabic-Indic Cube Root
    [`&#1543;`]: `؇`,  // Arabic-Indic Fourth Root
    [`&#1544;`]: `؈`,  // Arabic Ray
    [`&#1545;`]: `؉`,  // Arabic-Indic Per Mille Sign
    [`&#1546;`]: `؊`,  // Arabic-Indic Per Ten Thousand Sign
    [`&#1547;`]: `؋`,  // Afghani Sign
    [`&#1548;`]: `،`,  // Arabic Comma
    [`&#1549;`]: `؍`,  // Arabic Date Separator
    [`&#1550;`]: `؎`,  // Arabic Poetic Verse Sign
    [`&#1551;`]: `؏`,  // Arabic Sign Misra
    [`&#1552;`]: `ؐ`,  // Arabic Sign Sallallahou Alayhe Wassallam
    [`&#1553;`]: `ؑ`,  // Arabic Sign Alayhe Assallam
    [`&#1554;`]: `ؒ`,  // Arabic Sign Rahmatullahi Alayhe
    [`&#1555;`]: `ؓ`,  // Arabic Sign Radi Allaahu Anhu
    [`&#1556;`]: `ؔ`,  // Arabic Sign Radi Allaahu Anha
    [`&#1557;`]: `ؕ`,  // Arabic Sign Radi Allaahu Anhum
    [`&#1558;`]: `ؖ`,  // Arabic Sign Radi Allaahu Anhunna
    [`&#1559;`]: `ؗ`,  // Arabic Sign Radi Allaahu Anhumaa
    [`&#1560;`]: `ؘ`,  // Arabic Sign Radi Allaahu Anhaa
    [`&#1561;`]: `ؙ`,  // Arabic Sign Radi Allaahu Anhu
    [`&#1562;`]: `ؚ`,  // Arabic Sign Radi Allaahu Anha
    [`&#1563;`]: `؛`,  // Arabic Semicolon
    [`&#1564;`]: `؜`,  // Arabic Letter Mark
    [`&#1565;`]: `؝`,  // Arabic Triple Dot Punctuation Mark
    [`&#1566;`]: `؞`,  // Arabic Start of Rub El Hizb
    [`&#1567;`]: `؟`,  // Arabic Question Mark
    [`&#1568;`]: `ؠ`,  // Arabic Letter Hamza
    [`&#1569;`]: `ء`,  // Arabic Letter Alef with Hamza Above
    [`&#1570;`]: `آ`,  // Arabic Letter Alef with Madda Above
    [`&#1571;`]: `أ`,  // Arabic Letter Alef with Hamza Above
    [`&#1572;`]: `ؤ`,  // Arabic Letter Waw with Hamza Above
    [`&#1573;`]: `إ`,  // Arabic Letter Alef with Hamza Below
    [`&#1574;`]: `ئ`,  // Arabic Letter Yeh with Hamza Above
    [`&#1575;`]: `ا`,  // Arabic Letter Alef
    [`&#1576;`]: `ب`,  // Arabic Letter Beh
    [`&#1577;`]: `ة`,  // Arabic Letter Teh Marbuta
    [`&#1578;`]: `ت`,  // Arabic Letter Teh
    [`&#1579;`]: `ث`,  // Arabic Letter Theh
    [`&#1580;`]: `ج`,  // Arabic Letter Jeem
    [`&#1581;`]: `ح`,  // Arabic Letter Hah
    [`&#1582;`]: `خ`,  // Arabic Letter Khah
    [`&#1583;`]: `د`,  // Arabic Letter Dal
    [`&#1584;`]: `ذ`,  // Arabic Letter Thal
    [`&#1585;`]: `ر`,  // Arabic Letter Reh
    [`&#1586;`]: `ز`,  // Arabic Letter Zain
    [`&#1587;`]: `س`,  // Arabic Letter Seen
    [`&#1588;`]: `ش`,  // Arabic Letter Sheen
    [`&#1589;`]: `ص`,  // Arabic Letter Sad
    [`&#1590;`]: `ض`,  // Arabic Letter Dad
    [`&#1591;`]: `ط`,  // Arabic Letter Tah
    [`&#1592;`]: `ظ`,  // Arabic Letter Zah
    [`&#1593;`]: `ع`,  // Arabic Letter Ain
    [`&#1594;`]: `غ`,  // Arabic Letter Ghain
    [`&#1595;`]: `ػ`,  // Arabic Letter Keheh with Three Dots Above
    [`&#1596;`]: `ؼ`,  // Arabic Letter Keheh with Three Dots Below
    [`&#1597;`]: `ؽ`,  // Arabic Letter Farsi Yeh with Inverted V
    [`&#1598;`]: `ؾ`,  // Arabic Letter Farsi Yeh with Two Dots Above
    [`&#1599;`]: `ؿ`,  // Arabic Letter Farsi Yeh with Three Dots Above
    [`&#1600;`]: `ـ`,  // Arabic Tatweel
    [`&#1601;`]: `ف`,  // Arabic Letter Feh
    [`&#1602;`]: `ق`,  // Arabic Letter Qaf
    [`&#1603;`]: `ك`,  // Arabic Letter Kaf
    [`&#1604;`]: `ل`,  // Arabic Letter Lam
    [`&#1605;`]: `م`,  // Arabic Letter Meem
    [`&#1606;`]: `ن`,  // Arabic Letter Noon
    [`&#1607;`]: `ه`,  // Arabic Letter Heh
    [`&#1608;`]: `و`,  // Arabic Letter Waw
    [`&#1609;`]: `ى`,  // Arabic Letter Alef Maksura
    [`&#1610;`]: `ي`,  // Arabic Letter Yeh
    
    // Arabic diacritics (most common ones)
    [`&#1611;`]: `ً`,  // Arabic Fathatan
    [`&#1612;`]: `ٌ`,  // Arabic Dammatan
    [`&#1613;`]: `ٍ`,  // Arabic Kasratan
    [`&#1614;`]: `َ`,  // Arabic Fatha
    [`&#1615;`]: `ُ`,  // Arabic Damma
    [`&#1616;`]: `ِ`,  // Arabic Kasra
    [`&#1617;`]: `ّ`,  // Arabic Shadda
    [`&#1618;`]: `ْ`,  // Arabic Sukun
    [`&#1619;`]: `ٓ`,  // Arabic Maddah Above
    [`&#1620;`]: `ٔ`,  // Arabic Hamza Above
    [`&#1621;`]: `ٕ`,  // Arabic Hamza Below
    
    // Arabic-Indic digits
    [`&#1632;`]: `٠`,  // Arabic-Indic Digit Zero
    [`&#1633;`]: `١`,  // Arabic-Indic Digit One
    [`&#1634;`]: `٢`,  // Arabic-Indic Digit Two
    [`&#1635;`]: `٣`,  // Arabic-Indic Digit Three
    [`&#1636;`]: `٤`,  // Arabic-Indic Digit Four
    [`&#1637;`]: `٥`,  // Arabic-Indic Digit Five
    [`&#1638;`]: `٦`,  // Arabic-Indic Digit Six
    [`&#1639;`]: `٧`,  // Arabic-Indic Digit Seven
    [`&#1640;`]: `٨`,  // Arabic-Indic Digit Eight
    [`&#1641;`]: `٩`,  // Arabic-Indic Digit Nine
    
    // Extended Arabic characters (commonly used)
    [`&#1642;`]: `٪`,  // Arabic Percent Sign
    [`&#1643;`]: `٫`,  // Arabic Decimal Separator
    [`&#1644;`]: `٬`,  // Arabic Thousands Separator
    [`&#1645;`]: `٭`,  // Arabic Five Pointed Star
    [`&#1646;`]: `ٮ`,  // Arabic Letter Dotless Beh
    [`&#1647;`]: `ٯ`,  // Arabic Letter Dotless Qaf
    [`&#1648;`]: `ٰ`,  // Arabic Letter Superscript Alef
    [`&#1649;`]: `ٱ`,  // Arabic Letter Alef Wasla
    [`&#1650;`]: `ٲ`,  // Arabic Letter Alef with Wavy Hamza Above
    [`&#1651;`]: `ٳ`,  // Arabic Letter Alef with Wavy Hamza Below
    [`&#1652;`]: `ٴ`,  // Arabic Letter High Hamza
    [`&#1653;`]: `ٵ`,  // Arabic Letter High Hamza Alef
    [`&#1654;`]: `ٶ`,  // Arabic Letter High Hamza Waw
    [`&#1655;`]: `ٷ`,  // Arabic Letter U with Hamza Above
    [`&#1656;`]: `ٸ`,  // Arabic Letter High Hamza Yeh
    [`&#1657;`]: `ٹ`,  // Arabic Letter Tteh
    [`&#1658;`]: `ٺ`,  // Arabic Letter Tteheh
    [`&#1659;`]: `ٻ`,  // Arabic Letter Beeh
    [`&#1660;`]: `ټ`,  // Arabic Letter Teh with Ring
    [`&#1661;`]: `ٽ`,  // Arabic Letter Teh with Three Dots Above Downwards
    [`&#1662;`]: `پ`,  // Arabic Letter Peh
    [`&#1663;`]: `ٿ`,  // Arabic Letter Teheh
    [`&#1664;`]: `ڀ`,  // Arabic Letter Beheh
    [`&#1665;`]: `ځ`,  // Arabic Letter Hah with Hamza Above
    [`&#1666;`]: `ڂ`,  // Arabic Letter Hah with Two Dots Vertical Above
    [`&#1667;`]: `ڃ`,  // Arabic Letter Nyeh
    [`&#1668;`]: `ڄ`,  // Arabic Letter Dyeh
    [`&#1669;`]: `څ`,  // Arabic Letter Hah with Three Dots Above
    [`&#1670;`]: `چ`,  // Arabic Letter Tcheh
    [`&#1671;`]: `ڇ`,  // Arabic Letter Tcheheh
    [`&#1672;`]: `ڈ`,  // Arabic Letter Ddal
    [`&#1673;`]: `ډ`,  // Arabic Letter Dal with Ring
    [`&#1674;`]: `ڊ`,  // Arabic Letter Dal with Dot Below
    [`&#1675;`]: `ڋ`,  // Arabic Letter Dal with Dot Below and Small Tah
    [`&#1676;`]: `ڌ`,  // Arabic Letter Dahal
    [`&#1677;`]: `ڍ`,  // Arabic Letter Ddahal
    [`&#1678;`]: `ڎ`,  // Arabic Letter Dul
    [`&#1679;`]: `ڏ`,  // Arabic Letter Dal with Three Dots Above Downwards
    [`&#1680;`]: `ڐ`,  // Arabic Letter Dal with Four Dots Above
    [`&#1681;`]: `ڑ`,  // Arabic Letter Rreh
    [`&#1682;`]: `ڒ`,  // Arabic Letter Reh with Small V
    [`&#1683;`]: `ړ`,  // Arabic Letter Reh with Ring
    [`&#1684;`]: `ڔ`,  // Arabic Letter Reh with Dot Below
    [`&#1685;`]: `ڕ`,  // Arabic Letter Reh with Small V Below
    [`&#1686;`]: `ږ`,  // Arabic Letter Reh with Dot Below and Dot Above
    [`&#1687;`]: `ڗ`,  // Arabic Letter Reh with Two Dots Above
    [`&#1688;`]: `ژ`,  // Arabic Letter Jeh
    [`&#1689;`]: `ڙ`,  // Arabic Letter Reh with Four Dots Above
    [`&#1690;`]: `ښ`,  // Arabic Letter Seen with Dot Below and Dot Above
    [`&#1691;`]: `ڛ`,  // Arabic Letter Seen with Three Dots Below
    [`&#1692;`]: `ڜ`,  // Arabic Letter Seen with Three Dots Below and Three Dots Above
    [`&#1693;`]: `ڝ`,  // Arabic Letter Arab
    [`&#1694;`]: `ڞ`,  // Arabic Letter Seen with Two Dots Vertical Above
    [`&#1695;`]: `ڟ`,  // Arabic Letter Seen with Inverted V
    [`&#1696;`]: `ڠ`,  // Arabic Letter Seen with Two Dots Above
    [`&#1697;`]: `ڡ`,  // Arabic Letter Dotless Feh
    [`&#1698;`]: `ڢ`,  // Arabic Letter Feh with Dot Moved Below
    [`&#1699;`]: `ڣ`,  // Arabic Letter Feh with Dot Below
    [`&#1700;`]: `ڤ`,  // Arabic Letter Veh
    [`&#1701;`]: `ڥ`,  // Arabic Letter Feh with Three Dots Below
    [`&#1702;`]: `ڦ`,  // Arabic Letter Peheh
    [`&#1703;`]: `ڧ`,  // Arabic Letter Qaf with Dot Above
    [`&#1704;`]: `ڨ`,  // Arabic Letter Qaf with Three Dots Above
    [`&#1705;`]: `ک`,  // Arabic Letter Keheh
    [`&#1706;`]: `ڪ`,  // Arabic Letter Swash Kaf
    [`&#1707;`]: `ګ`,  // Arabic Letter Kaf with Ring
    [`&#1708;`]: `ڬ`,  // Arabic Letter Kaf with Dot Above
    [`&#1709;`]: `ڭ`,  // Arabic Letter Ng
    [`&#1710;`]: `ڮ`,  // Arabic Letter Kaf with Three Dots Below
    [`&#1711;`]: `گ`,  // Arabic Letter Gaf
    [`&#1712;`]: `ڰ`,  // Arabic Letter Gaf with Ring
    [`&#1713;`]: `ڱ`,  // Arabic Letter Ngoeh
    [`&#1714;`]: `ڲ`,  // Arabic Letter Gaf with Two Dots Below
    [`&#1715;`]: `ڳ`,  // Arabic Letter Gueh
    [`&#1716;`]: `ڴ`,  // Arabic Letter Gaf with Three Dots Above
    [`&#1717;`]: `ڵ`,  // Arabic Letter Lam with Small V
    [`&#1718;`]: `ڶ`,  // Arabic Letter Lam with Dot Above
    [`&#1719;`]: `ڷ`,  // Arabic Letter Lam with Three Dots Above
    [`&#1720;`]: `ڸ`,  // Arabic Letter Lam with Three Dots Below
    [`&#1721;`]: `ڹ`,  // Arabic Letter Noon with Dot Below
    [`&#1722;`]: `ں`,  // Arabic Letter Noon Ghunna
    [`&#1723;`]: `ڻ`,  // Arabic Letter Rnoon
    [`&#1724;`]: `ڼ`,  // Arabic Letter Noon with Ring
    [`&#1725;`]: `ڽ`,  // Arabic Letter Noon with Three Dots Above
    [`&#1726;`]: `ھ`,  // Arabic Letter Heh Doachashmee
    [`&#1727;`]: `ڿ`,  // Arabic Letter Tcheh with Dot Above
    [`&#1728;`]: `ۀ`,  // Arabic Letter Heh with Yeh Above
    [`&#1729;`]: `ہ`,  // Arabic Letter Heh Goal
    [`&#1730;`]: `ۂ`,  // Arabic Letter Heh Goal with Hamza Above
    [`&#1731;`]: `ۃ`,  // Arabic Letter Teh Marbuta Goal
    [`&#1732;`]: `ۄ`,  // Arabic Letter Waw with Ring
    [`&#1733;`]: `ۅ`,  // Arabic Letter Kirghiz Oe
    [`&#1734;`]: `ۆ`,  // Arabic Letter Oe
    [`&#1735;`]: `ۇ`,  // Arabic Letter U
    [`&#1736;`]: `ۈ`,  // Arabic Letter Yu
    [`&#1737;`]: `ۉ`,  // Arabic Letter Kirghiz Yu
    [`&#1738;`]: `ۊ`,  // Arabic Letter Waw with Two Dots Above
    [`&#1739;`]: `ۋ`,  // Arabic Letter Ve
    [`&#1740;`]: `ی`,  // Arabic Letter Farsi Yeh
    [`&#1741;`]: `ۍ`,  // Arabic Letter Yeh with Tail
    [`&#1742;`]: `ێ`,  // Arabic Letter Yeh with Small V
    [`&#1743;`]: `ۏ`,  // Arabic Letter Waw with Dot Above
    [`&#1744;`]: `ې`,  // Arabic Letter E
    [`&#1745;`]: `ۑ`,  // Arabic Letter Yeh with Three Dots Below
    [`&#1746;`]: `ے`,  // Arabic Letter Yeh Barree
    [`&#1747;`]: `ۓ`,  // Arabic Letter Yeh Barree with Hamza Above
  }

  public getLang(cookies: { [key: string]: string }): string {
    try {
      const defaultLang = this.getDefaultLang()
      const langKey = (cookies?.lang || defaultLang).toLowerCase()
      const foundLang = this.getLanguages().find(l => l.lang === langKey)
      return (foundLang === undefined) ? defaultLang : foundLang.lang
    } catch (error) {
      this.logError(new ValidationError('cookies', cookies), 'getLang')
      return this.getDefaultLang()
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private logError(error: Error, context: string): void {
    if (this.opt.log) {
      this.opt.log(error, { context, timestamp: new Date().toISOString() })
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    let lastError: Error
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        this.logError(error, `${operationName} - Attempt ${attempt}/${maxRetries}`)
        
        if (attempt < maxRetries) {
          await this.sleep(this.retryDelay * attempt) // Exponential backoff
        }
      }
    }
    
    throw lastError
  }

  public async translateText(langOrReq: string | any, text: string): Promise<string> {
    try {
      // Input validation
      if (!text || typeof text !== 'string') {
        throw new ValidationError('text', text)
      }

      const lang = typeof langOrReq === 'string' ? langOrReq : this.getLang(langOrReq.cookies)
      text = text.trim()
      
      if (text.length === 0) {
        return text
      }
      
      if (text.length === 1) {
        return text
      }

      // Process HTML entities with better error handling
      text = await this.processHtmlEntities(text)

      // Check local cache
      const localCached = this.checkLocalCache(text, lang)
      if (localCached !== false) {
        return localCached.value
      }

      // Check remote cache
      const remoteCached = await this.fetch(text, lang)
      if (remoteCached !== false) {
        return remoteCached.value
      }

      // Perform translation with retry logic
      let result: string
      try {
        result = await this.retryOperation(async () => {
          return await translate(text, {
            from: this.getSourceLang(),
            to: lang,
          })
        }, 'translateText')
      } catch (err) {
        const translationError = new ApiTranslationError(err, text, lang)
        this.logError(translationError, 'translateText')
        
        if (!this.surpressErrors) {
          throw translationError
        }
        result = this.fallbackText
      }

      // Save translation to cache
      try {
        await this.insert(text, lang, { value: result })
      } catch (err) {
        this.logError(new DatabaseError(err, 'insert translation'), 'translateText')
        // Don't throw here, translation still succeeded
      }

      return result
    } catch (error) {
      if (error instanceof TranslateError) {
        throw error
      }
      
      const wrappedError = new TranslateError(`Unexpected error in translateText: ${error.message}`, 'UNEXPECTED_ERROR', { originalError: error })
      this.logError(wrappedError, 'translateText')
      
      if (!this.surpressErrors) {
        throw wrappedError
      }
      
      return this.fallbackText
    }
  }

  private async processHtmlEntities(text: string): Promise<string> {
    let replaceCount = 0
    const maxReplacements = 1000

    while (text.includes('&#')) {
      const codeIndexStart = text.indexOf('&#')
      const first = text.substring(codeIndexStart)
      const semicolonIndex = first.indexOf(';')
      
      if (semicolonIndex === -1) {
        // No closing semicolon found, break to avoid infinite loop
        break
      }
      
      const codeLength = semicolonIndex + 1
      const code = first.substring(0, codeLength)
      
      if (this.codes[code] === undefined) {
        const entityError = new HtmlEntityError(code, text)
        this.logError(entityError, 'processHtmlEntities')
        
        if (!this.surpressErrors) {
          throw entityError
        }
        // Skip this entity and continue
        text = text.substring(0, codeIndexStart) + code + text.substring(codeIndexStart + codeLength)
        break
      }
      
      text = text.substring(0, codeIndexStart) + this.codes[code] + text.substring(codeIndexStart + codeLength)
      
      if (replaceCount++ > maxReplacements) {
        const loopError = new TranslateError(
          `HTML entity replacement exceeded maximum count (${maxReplacements})`,
          'MAX_REPLACEMENTS_EXCEEDED',
          { code, text, replaceCount }
        )
        this.logError(loopError, 'processHtmlEntities')
        
        if (!this.surpressErrors) {
          throw loopError
        }
        break
      }
    }
    
    return text
  }

  public async translateHtml(html: string, cookies: { lang: string } & { [key: string]: string }): Promise<string> {
    try {
      if (!html || typeof html !== 'string') {
        throw new ValidationError('html', html)
      }

      if (!cookies) {
        throw new ValidationError('cookies', cookies)
      }

      const lang = this.getLang(cookies)
      const srcLang = this.getSourceLang()
      
      let dom: any
      try {
        dom = parseFromString(html)
      } catch (error) {
        const parseError = new TranslateError('Failed to parse HTML', 'HTML_PARSE_ERROR', { error, html })
        this.logError(parseError, 'translateHtml')
        
        if (!this.surpressErrors) {
          throw parseError
        }
        return html
      }

      const htmlNodes: Node[] = dom.getElementsByTagName('html')
      const mainNodes: Node[] = dom.getElementsByTagName('main')
      const isView = htmlNodes.length === 0
      const domNode: Node = isView ? mainNodes[0] : htmlNodes[0]

      if (lang !== srcLang && domNode) {
        const node: Node = isView ? domNode : domNode.getElementsByTagName('body')[0]
        if (node) {
          const promises: Promise<any>[] = []
          this.translateHtmlRec(lang, node, promises)
          
          try {
            await Promise.all(promises)
          } catch (error) {
            this.logError(new TranslateError('Failed to translate HTML nodes', 'HTML_TRANSLATION_ERROR', { error }), 'translateHtml')
            if (!this.surpressErrors) {
              throw error
            }
          }
        }
      }

      const output = domNode ? domNode.outerHTML : html
      return output.startsWith(`<!DOCTYPE html>`) ? output : `<!DOCTYPE html>\r\n${output}`
    } catch (error) {
      if (error instanceof TranslateError) {
        throw error
      }
      
      const wrappedError = new TranslateError(`Unexpected error in translateHtml: ${error.message}`, 'UNEXPECTED_ERROR', { originalError: error })
      this.logError(wrappedError, 'translateHtml')
      
      if (!this.surpressErrors) {
        throw wrappedError
      }
      
      return html
    }
  }

  private translateHtmlRec(lang: string, node: Node, promises: Promise<any>[], skipTranslate: boolean = false): void {
    try {
      if (this.opt.verbose) this.opt.verbose(node.nodeName, node)
      
      if (node.getAttribute && node.getAttribute('notranslate') != null) {
        skipTranslate = true
      }
      
      if (node.nodeName === '#comment') {
        // Skip HTML comments
        return
      }
      if (node.nodeName === 'script') {
        // Skip script tags
        return
      }
      if (node.nodeName === 'style') {
        // Skip style tags
        return
      }
      
      if (node.nodeName === '#text') {
        const nodeText: Node = node
        const text = nodeText.text.replace(/[\r|\n|\r\n]+/g, ' ').replace(/\s\s+/g, ' ')
        const value = text.trim()
        const meta = {
          prefix: genSpaces(text.length - text.trimStart().length),
          suffix: genSpaces(text.length - text.trimEnd().length),
        }
        
        if (skipTranslate === true || text.length === 0 || !strContainsLetters(text)) {
          node.text = meta.prefix + text + meta.suffix
          return
        }
        
        promises.push(
          this.translateText(lang, value)
            .then((translatedText: string) => {
              node.text = meta.prefix + translatedText + meta.suffix
            })
            .catch((err) => {
              node.text = text
              this.logError(err, 'translateHtmlRec')
              if (!this.surpressErrors) {
                throw err
              }
            }),
        )
        return
      }
      
      // Process child nodes safely
      if (node.childNodes && Array.isArray(node.childNodes)) {
        for (const child of node.childNodes) {
          this.translateHtmlRec(lang, child, promises, skipTranslate)
        }
      }
    } catch (error) {
      this.logError(new TranslateError(`Error processing HTML node: ${error.message}`, 'HTML_NODE_ERROR', { error, nodeName: node?.nodeName }), 'translateHtmlRec')
      if (!this.surpressErrors) {
        throw error
      }
    }
  }

  public async update(key: string, lang: string, data: TranslateData) {
    try {
      if (!key || !lang || !data) {
        throw new ValidationError('update parameters', { key, lang, data })
      }

      const res = await this.retryOperation(async () => {
        return await this.sql.query(`
          INSERT INTO translations
            (\`key\`, \`lang\`, \`value\`)
          VALUES
            (:key, :lang, :value)
          ON DUPLICATE KEY UPDATE value=:value
        `, { key, lang, value: data.value })
      }, 'update translation')

      if (res.affectedRows) {
        this.insertLocalCache(key, lang, data)
      }
      return res
    } catch (error) {
      const dbError = new DatabaseError(error, 'update translation')
      this.logError(dbError, 'update')
      throw dbError
    }
  }

  private checkLocalCache(key: string, lang: string): TranslateData | false {
    try {
      if (!key || !lang || !this.localCache[lang]) {
        return false
      }
      const hasLocal = !this.localCache[lang].hasOwnProperty(key)
      return hasLocal ? false : this.localCache[lang][key]
    } catch (error) {
      this.logError(new TranslateError('Local cache check failed', 'CACHE_ERROR', { error, key, lang }), 'checkLocalCache')
      return false
    }
  }

  private insertLocalCache(key: string, lang: string, data: TranslateData): void {
    try {
      if (!key || !lang || !data) {
        return
      }
      if (!this.localCache[lang]) {
        this.localCache[lang] = {}
      }
      this.localCache[lang][key] = data
    } catch (error) {
      this.logError(new TranslateError('Local cache insertion failed', 'CACHE_ERROR', { error, key, lang }), 'insertLocalCache')
    }
  }

  private clearLocalCache(): void {
    try {
      Object.keys(this.localCache).map((k) => {
        this.localCache[k] = {}
      })
    } catch (error) {
      this.logError(new TranslateError('Failed to clear local cache', 'CACHE_ERROR', { error }), 'clearLocalCache')
    }
  }

  private async fetch(key: string, lang: string): Promise<TranslateData | false> {
    try {
      if (!key || !lang) {
        return false
      }

      const results = await this.retryOperation(async () => {
        return await this.sql.query<any>(`SELECT \`value\` FROM translations WHERE \`lang\`=? AND \`key\`=CONVERT(? USING utf8mb4)`, [lang, key])
      }, 'fetch translation')

      if (results.length > 0) {
        const { value } = results[0]
        const data = { value } as TranslateData
        this.insertLocalCache(key, lang, data)
        return data
      }
      return false
    } catch (error) {
      const dbError = new DatabaseError(error, 'fetch translation')
      this.logError(dbError, 'fetch')
      return false // Don't throw, let translation proceed
    }
  }

  private async insert(key: string, lang: string, data: TranslateData): Promise<void> {
    try {
      if (!key || !lang || !data) {
        throw new ValidationError('insert parameters', { key, lang, data })
      }

      await this.retryOperation(async () => {
        return await this.sql.query(`INSERT IGNORE INTO translations (\`key\`, \`lang\`, \`value\`) VALUES (?, ?, ?)`, [
          key,
          lang,
          data.value,
        ])
      }, 'insert translation')
    } catch (error) {
      const dbError = new DatabaseError(error, 'insert translation')
      this.logError(dbError, 'insert')
      throw dbError
    }
  }

  private async fetchLang(lang: string): Promise<dbTranslationRow[]> {
    try {
      if (!lang) {
        throw new ValidationError('lang', lang)
      }

      return await this.retryOperation(async () => {
        return await this.sql.query<any>(
          `SELECT \`key\`, \`lang\`, \`value\`, \`verified\`, \`created_at\` FROM translations WHERE \`lang\`=?`,
          [lang],
        )
      }, 'fetchLang')
    } catch (error) {
      const dbError = new DatabaseError(error, 'fetch language translations')
      this.logError(dbError, 'fetchLang')
      throw dbError
    }
  }

  public async fetchAllGrouped(): Promise<{ [key: string]: dbTranslationRow[] }> {
    try {
      const output: { [key: string]: dbTranslationRow[] } = {}
      const allTranslations = await this.fetchAll()
      
      allTranslations.forEach((translation) => {
        const { key } = translation
        if (!output.hasOwnProperty(key)) {
          output[key] = []
        }
        output[key].push(translation)
      })
      
      return output
    } catch (error) {
      const dbError = new DatabaseError(error, 'fetch all grouped translations')
      this.logError(dbError, 'fetchAllGrouped')
      throw dbError
    }
  }

  private async fetchAll(): Promise<dbTranslationRow[]> {
    try {
      return await this.retryOperation(async () => {
        return await this.sql.query<dbTranslationRow>(`SELECT \`key\`, \`lang\`, \`value\`, \`verified\`, \`created_at\` FROM translations`)
      }, 'fetchAll')
    } catch (error) {
      const dbError = new DatabaseError(error, 'fetch all translations')
      this.logError(dbError, 'fetchAll')
      throw dbError
    }
  }
}

function strContainsLetters(text: string): boolean {
  // Updated regex to include Arabic characters (U+0600-U+06FF) and other scripts
  const regExp = /[a-zA-Z\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g
  return regExp.test(text)
}

function genSpaces(length: number): string {
  let output: string = ''
  for (let i = 0; i < length; i++) {
    output += ' '
  }
  return output
}
