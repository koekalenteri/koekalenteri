export type Event = {
  id: string
  organizer: string // TODO split to own type
  eventType: string
  classes: Array<string>
  startDate: Date
  endDate: Date
  entryStartDate: Date
  entryEndDate: Date
  location: string
  name: string
  description: string
  places: number // TODO places / class
  entries: number // TODO entries / class
  allowOnlineEntry: boolean
  allowOnlinePayment: boolean
  unofficial: boolean
  allowOwnerMembershipPriority: boolean
  allowHandlerMembershipPriority: boolean
  cost: number
  costMember: number
  paymentDetails: string
  accountNumber: string
  referenceNumber: string
  requirePaymentBeforeEntry: boolean
  judges: Array<number> //TODO judges / class
  official: number
  createdAt: string
  createdBy: string
  modifiedAt: string
  modifiedBy: string
}
