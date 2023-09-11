export interface PublicOrganizer {
  id: string
  name: string
}

export interface Organizer extends PublicOrganizer {
  kcId?: number
  active?: boolean
  adminUserId?: string
  paytrailMerchantId?: string
}
