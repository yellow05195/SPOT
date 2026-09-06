/**
 * Real brand logos, full colour, transparent, no box.
 *   1. the official SVG in /public/logos (from Wikimedia Commons)
 *   2. the brand's favicon at 256 px (Google's service) as a last resort
 */
import ICONS from "./icons.json";

interface LogoSource {
  local?: string;
  domain: string;
  /** dark marks get a soft white halo on dark backgrounds */
  dark?: boolean;
  /** wordmarks are wide: rendered a little smaller so they sit next to square marks */
  wide?: boolean;
}

export const LOGOS: Record<string, LogoSource> = {
  Amazon: { local: "amazon", domain: "amazon.com", dark: true, wide: true },
  UPS: { local: "ups", domain: "ups.com" },
  DHL: { local: "dhl", domain: "dhl.com", wide: true },
  FedEx: { local: "fedex", domain: "fedex.com", wide: true },
  Maersk: { local: "maersk", domain: "maersk.com", dark: true, wide: true },
  "Coca-Cola": { local: "cocacola", domain: "coca-cola.com", wide: true },
  PepsiCo: { local: "pepsico", domain: "pepsico.com", dark: true, wide: true },
  Celsius: { local: "celsius", domain: "celsius.com", dark: true, wide: true },
  Monster: { local: "monster", domain: "monsterenergy.com" },
  Starbucks: { local: "starbucks", domain: "starbucks.com" },
  Tesla: { local: "tesla", domain: "tesla.com" },
  Ford: { local: "ford", domain: "ford.com", wide: true },
  Rivian: { local: "rivian", domain: "rivian.com", dark: true, wide: true },
  Uber: { local: "uber", domain: "uber.com", dark: true, wide: true },
  Toyota: { local: "toyota", domain: "toyota.com" },
  Apple: { local: "apple", domain: "apple.com", dark: true },
  Samsung: { local: "samsung", domain: "samsung.com", wide: true },
  Sony: { local: "sony", domain: "sony.com", dark: true, wide: true },
  Microsoft: { local: "microsoft", domain: "microsoft.com", dark: true, wide: true },
  Netflix: { local: "netflix", domain: "netflix.com", wide: true },
  Shell: { local: "shell", domain: "shell.com" },
  TotalEnergies: { local: "totalenergies", domain: "totalenergies.com" },
  BP: { local: "bp", domain: "bp.com" },
  ExxonMobil: { local: "exxonmobil", domain: "exxonmobil.com", wide: true },
  "McDonald's": { local: "mcdonalds", domain: "mcdonalds.com" },
  "Domino's": { local: "dominos", domain: "dominos.com" },
  Nestlé: { local: "nestle", domain: "nestle.com", dark: true, wide: true },
  Unilever: { local: "unilever", domain: "unilever.com", wide: true },
  Costco: { local: "costco", domain: "costco.com", wide: true },
  Nike: { local: "nike", domain: "nike.com", dark: true, wide: true },
  Inditex: { local: "inditex", domain: "inditex.com", dark: true, wide: true },
  Walmart: { local: "walmart", domain: "walmart.com", wide: true },
  Target: { local: "target", domain: "target.com" },
  Visa: { local: "visa", domain: "visa.com", wide: true },
  Mastercard: { local: "mastercard", domain: "mastercard.com" },
  "American Express": { local: "amex", domain: "americanexpress.com" },
  Google: { local: "google", domain: "google.com", wide: true },
  Meta: { local: "meta", domain: "meta.com", wide: true },
  Disney: { local: "disney", domain: "disney.com", dark: true, wide: true },
  "Home Depot": { local: "homedepot", domain: "homedepot.com" },
  Chevron: { local: "chevron", domain: "chevron.com" },
  "Burger King": { local: "burgerking", domain: "bk.com" },
  KFC: { local: "kfc", domain: "kfc.com" },
  Chipotle: { local: "chipotle", domain: "chipotle.com", wide: true },
  Intel: { local: "intel", domain: "intel.com", wide: true },
  Nvidia: { local: "nvidia", domain: "nvidia.com", dark: true, wide: true },
  Spotify: { local: "spotify", domain: "spotify.com", dark: true, wide: true },
  Airbnb: { local: "airbnb", domain: "airbnb.com" },
  Lyft: { local: "lyft", domain: "lyft.com", wide: true },
  DoorDash: { local: "doordash", domain: "doordash.com", wide: true },
  IBM: { local: "ibm", domain: "ibm.com", wide: true },
  Adidas: { local: "adidas", domain: "adidas.com", dark: true },
  Puma: { local: "puma", domain: "puma.com", dark: true, wide: true },
  "H&M": { local: "hm", domain: "hm.com", wide: true },
  Volkswagen: { local: "volkswagen", domain: "vw.com" },
  BMW: { local: "bmw", domain: "bmw.com", dark: true },
  "Mercedes-Benz": { local: "mercedes", domain: "mercedes-benz.com", dark: true },
  Audi: { local: "audi", domain: "audi.com", dark: true, wide: true },
  Renault: { local: "renault", domain: "renault.com", dark: true },
  Ferrari: { local: "ferrari", domain: "ferrari.com" },
  Siemens: { local: "siemens", domain: "siemens.com", wide: true },
  Philips: { local: "philips", domain: "philips.com", wide: true },
  "L'Oréal": { local: "loreal", domain: "loreal.com", dark: true, wide: true },
  "Louis Vuitton": { local: "louisvuitton", domain: "louisvuitton.com", dark: true, wide: true },
  Gucci: { local: "gucci", domain: "gucci.com", dark: true, wide: true },
  Heineken: { local: "heineken", domain: "heineken.com", wide: true },
  Carrefour: { local: "carrefour", domain: "carrefour.com", wide: true },
  Tesco: { local: "tesco", domain: "tesco.com", wide: true },
  Vodafone: { local: "vodafone", domain: "vodafone.com" },
  Orange: { local: "orange", domain: "orange.com" },
  "Deutsche Telekom": { local: "telekom", domain: "telekom.com", wide: true },
  Lufthansa: { local: "lufthansa", domain: "lufthansa.com", dark: true, wide: true },
  Ryanair: { local: "ryanair", domain: "ryanair.com", wide: true },
  Airbus: { local: "airbus", domain: "airbus.com", wide: true },
  SAP: { local: "sap", domain: "sap.com", wide: true },
  Zalando: { local: "zalando", domain: "zalando.com", wide: true },
  Allianz: { local: "allianz", domain: "allianz.com", wide: true },
  AXA: { local: "axa", domain: "axa.com" },
  HSBC: { local: "hsbc", domain: "hsbc.com", dark: true, wide: true },
  Santander: { local: "santander", domain: "santander.com", wide: true },
  Hyundai: { local: "hyundai", domain: "hyundai.com", wide: true },
  Kia: { local: "kia", domain: "kia.com", dark: true, wide: true },
  Nintendo: { local: "nintendo", domain: "nintendo.com", wide: true },
  LG: { local: "lg", domain: "lg.com", wide: true },
  Panasonic: { local: "panasonic", domain: "panasonic.com", wide: true },
  Uniqlo: { local: "uniqlo", domain: "uniqlo.com", wide: true },
  Canon: { local: "canon", domain: "canon.com", wide: true },
  Xiaomi: { local: "xiaomi", domain: "mi.com" },
  Shopify: { local: "shopify", domain: "shopify.com", dark: true, wide: true },
  Lululemon: { local: "lululemon", domain: "lululemon.com" },
  Delta: { local: "delta", domain: "delta.com", wide: true },
  "American Airlines": { local: "americanairlines", domain: "aa.com", wide: true },
  "Procter & Gamble": { local: "pg", domain: "pg.com", wide: true },
  "Kellogg's": { local: "kelloggs", domain: "kelloggs.com", wide: true },
  Chevrolet: { local: "chevrolet", domain: "chevrolet.com", wide: true },
  Jeep: { local: "jeep", domain: "jeep.com", dark: true, wide: true },
  Caterpillar: { local: "caterpillar", domain: "caterpillar.com", dark: true, wide: true },
  "John Deere": { local: "johndeere", domain: "deere.com", wide: true },
  Boeing: { local: "boeing", domain: "boeing.com", wide: true },
  Dell: { local: "dell", domain: "dell.com" },
  HP: { local: "hp", domain: "hp.com" },
  Cisco: { local: "cisco", domain: "cisco.com", wide: true },
  Oracle: { local: "oracle", domain: "oracle.com", wide: true },
  Adobe: { local: "adobe", domain: "adobe.com", wide: true },
  Coinbase: { local: "coinbase", domain: "coinbase.com", wide: true },
  "Bank of America": { local: "bankofamerica", domain: "bankofamerica.com", wide: true },
  Chase: { local: "chase", domain: "chase.com", wide: true },
  "Wells Fargo": { local: "wellsfargo", domain: "wellsfargo.com", wide: true },
  CVS: { local: "cvs", domain: "cvs.com", wide: true },
  Walgreens: { local: "walgreens", domain: "walgreens.com", wide: true },
  "Lowe's": { local: "lowes", domain: "lowes.com", wide: true },
  "Wendy's": { local: "wendys", domain: "wendys.com", wide: true },
  "7-Eleven": { local: "7eleven", domain: "7-eleven.com" },
  Ericsson: { local: "ericsson", domain: "ericsson.com", wide: true },
  Nokia: { local: "nokia", domain: "nokia.com", wide: true },
  BIC: { local: "bic", domain: "bic.com", wide: true },
  Repsol: { local: "repsol", domain: "repsol.com", wide: true },
  "Air France": { local: "airfrance", domain: "airfrance.com", dark: true, wide: true },
  easyJet: { local: "easyjet", domain: "easyjet.com", wide: true },
  ING: { local: "ing", domain: "ing.com", wide: true },
  "BNP Paribas": { local: "bnp", domain: "bnpparibas.com", wide: true },
  "Deutsche Bank": { local: "deutschebank", domain: "db.com" },
  Barclays: { local: "barclays", domain: "barclays.com", wide: true },
  Peugeot: { local: "peugeot", domain: "peugeot.com", dark: true },
  Fiat: { local: "fiat", domain: "fiat.com" },
  Continental: { local: "continental", domain: "continental.com", dark: true, wide: true },
  Nissan: { local: "nissan", domain: "nissan-global.com", dark: true },
  Suzuki: { local: "suzuki", domain: "globalsuzuki.com", wide: true },
  "Harley-Davidson": { local: "harley", domain: "harley-davidson.com", dark: true, wide: true },
  Tencent: { local: "tencent", domain: "tencent.com", wide: true },
  Toshiba: { local: "toshiba", domain: "toshiba.com", wide: true },
  Honda: { local: "honda", domain: "honda.com", dark: true },
  Danone: { local: "danone", domain: "danone.com", wide: true },
  Michelin: { local: "michelin", domain: "michelin.com", wide: true },
  Alibaba: { local: "alibaba", domain: "alibaba.com", wide: true },
  BYD: { local: "byd", domain: "byd.com", wide: true },
  Robinhood: { local: "robinhood", domain: "robinhood.com", wide: true },
  Volvo: { local: "volvo", domain: "volvocars.com", dark: true },
  Porsche: { local: "porsche", domain: "porsche.com", dark: true },
  Marriott: { local: "marriott", domain: "marriott.com", dark: true, wide: true },
  Colgate: { local: "colgate", domain: "colgate.com", wide: true },
  Heinz: { local: "heinz", domain: "kraftheinzcompany.com", wide: true },
  Budweiser: { local: "budweiser", domain: "budweiser.com", wide: true },
  UBS: { local: "ubs", domain: "ubs.com", wide: true },
  Hilton: { local: "hilton", domain: "hilton.com", dark: true, wide: true },
};

/** Brands whose official SVG could not be fetched: the favicon service stands in. */
const NO_LOCAL = new Set(["Monster","Starbucks","Shell","TotalEnergies","BP","Chipotle","Mercedes-Benz","Ferrari","Carrefour","Ryanair","Airbus","Kia","Panasonic","Lululemon","Delta","American Airlines","Caterpillar","John Deere","Adobe","Bank of America","Chase","Wells Fargo","CVS","Walgreens","Lowe's","Ericsson","BIC","Repsol","easyJet","ING","Deutsche Bank","Barclays","Peugeot","Continental","Toshiba","Honda","Danone","Michelin","Alibaba","BYD","Robinhood","Porsche","Colgate","Heinz","Budweiser","UBS","Hilton"]);

export function logoSources(brand: string): string[] {
  const l = LOGOS[brand];
  if (!l) return [];
  const out: string[] = [];
  if (l.local && !NO_LOCAL.has(brand)) out.push(`/logos/${l.local}.svg`);
  out.push(`https://www.google.com/s2/favicons?domain=${l.domain}&sz=256`);
  return out;
}

/** Square "profile picture" icons: the brand's own app icon (self-hosted), then its official SVG, then the favicon service. */
export function iconSources(brand: string): string[] {
  const l = LOGOS[brand];
  if (!l) return [];
  const out: string[] = [];
  const file = l.local ? (ICONS as Record<string, string>)[l.local] : undefined;
  if (file) out.push(`/logos/${file}`);
  out.push(`https://www.google.com/s2/favicons?domain=${l.domain}&sz=256`);
  return out;
}

export function logoIsDark(brand: string): boolean {
  return Boolean(LOGOS[brand]?.dark);
}

export function logoIsWide(brand: string): boolean {
  return Boolean(LOGOS[brand]?.wide);
}
