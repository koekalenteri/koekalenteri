export default function PlacesDisplay({ value }: { value: number; }) {
  return (<>{value === 0 ? '' : value}</>)
}
