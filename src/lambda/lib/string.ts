export function capitalize(s?: string): string {
  return s?.toLowerCase().replace(/(^|[ -])[^ -]/g, (l: string) => l.toUpperCase()) ?? ''
}

export function reverseName(name?: string): string {
  const [last = '', first = ''] = name?.split(' ') ?? []
  return `${first} ${last}`.trim()
}
