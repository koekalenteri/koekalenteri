export default function PlacesDisplay({ value }: { readonly value: number }) {
  return <>{value === 0 ? '' : value}</>
}
