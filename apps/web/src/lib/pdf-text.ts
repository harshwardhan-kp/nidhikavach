/** Standard PDF fonts speak WinAnsi only: spell the rupee sign out, straighten typography, drop anything else. */
export function pdfSafe(t: string) {
  return t
    .replace(/₹\s?/g, "Rs. ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}
