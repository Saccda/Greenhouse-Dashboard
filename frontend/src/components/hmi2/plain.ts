/**
 * Strip Telegram formatting out of an alert message for display.
 *
 * These messages are composed for Telegram, where *asterisks* mean bold and a
 * leading emoji is the severity marker. Rendered as plain text on a control
 * screen they are noise: the reader picks their way past punctuation that
 * means nothing here, and severity is already carried by the shape and colour
 * in the priority column beside it.
 *
 * Only the DISPLAY is cleaned. The stored message is untouched, so Telegram
 * keeps receiving exactly what it expects and the log stays faithful to what
 * was actually sent.
 *
 * Emoji are matched by Unicode property rather than by listing the ones seen
 * so far — a list would silently stop working the day somebody adds a new
 * marker to the alert templates.
 */
export function plain(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")   // any emoji, present or future
    .replace(/️/g, "")                        // the variation selector they trail
    .replace(/\*+/g, "")                           // Telegram bold
    .replace(/\s+/g, " ")
    .trim();
}
