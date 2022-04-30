
export function capitalize(s: string) {
  return s.toLowerCase().replace(/(^|[ -])[^ -]/g, (l: string) => l.toUpperCase());
}
