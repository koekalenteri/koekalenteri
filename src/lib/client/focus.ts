/**
 * Takes the focus off whatever has it. A field that holds a typed value back for a moment
 * (`useLocalState`, `NumberInput`) hands it over as it loses the focus, so the value reaches the form
 * now. A dialog that closes without a click, on Esc, calls this first: a click has already moved the
 * focus, and Esc has not. Without it the value arrives as the dialog removes the field, after the
 * close has dropped the draft it lands in (KOE-1700).
 */
export const releaseFocus = () => {
  const focused = document.activeElement
  if (focused instanceof HTMLElement) focused.blur()
}
