/**
 * A municipality from the Kennelliitto register, offered as an option in the event form's
 * location field. Refreshed weekly by RefreshLocationsFunction.
 */
export interface Location {
  /** kennelpiiri the municipality belongs to */
  district: string
  /** KL number of the municipality */
  id: number
  name: string
}
