/**
 * Everyone plays everywhere: a photo anywhere in the world earns the card and a pin on the map.
 * The Stock Token fragment is only handed out where Robinhood offers these tokens: not in the
 * United States, Canada, the United Kingdom or Switzerland, nor in countries under global OFAC
 * sanctions, nor when the country cannot be determined.
 */
export const NO_FRAGMENT_COUNTRIES = new Set(["US", "CA", "GB", "CH", "CU", "IR", "KP", "SY", "RU", "BY", "VE", "MM"]);

export function fragmentsAllowedIn(country: string | null | undefined): boolean {
  const c = (country ?? "").trim().toUpperCase();
  return c.length === 2 && c !== "XX" && !NO_FRAGMENT_COUNTRIES.has(c);
}
