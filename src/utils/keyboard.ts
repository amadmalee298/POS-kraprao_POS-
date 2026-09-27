/**
 * True when a key event comes from a text field. Screen-wide keypad shortcuts (PIN pad,
 * numpad) must ignore these, or they swallow the digits the user is typing into the field.
 */
export function isTypingInField(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}
