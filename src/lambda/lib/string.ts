export function capitalize(s?: string): string {
  return s?.toLowerCase().replace(/(^|[ -])[^ -]/g, (l: string) => l.toUpperCase()) ?? ''
}

export function reverseName(name?: string): string {
  const [last = '', first = ''] = name?.split(' ') ?? []
  return `${first} ${last}`.trim()
}

export const splitName = (name?: string): { firstName: string; lastName: string } => {
  const parts = name?.trim().split(' ').filter(Boolean)
  const lastName = parts?.pop()?.trim() ?? ''
  const firstName = parts?.shift()?.trim() ?? ''

  return { firstName, lastName }
}
