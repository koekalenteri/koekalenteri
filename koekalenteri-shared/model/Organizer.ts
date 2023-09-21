export interface PublicOrganizer {
  id: string
  name: string
}

export interface Organizer extends PublicOrganizer {
  kcId?: number
  active?: boolean
  paytrailMerchantId?: string
}
