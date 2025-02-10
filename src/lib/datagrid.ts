const collator = new Intl.Collator('fi-FI')

export const localeSortComparator = (a?: string, b?: string) => {
  if (a) {
    return b ? collator.compare(a, b) : -1
  }
  return b ? 1 : 0
}
