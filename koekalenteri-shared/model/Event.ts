export type Event = {
    id: string
    "eventType": string
    "classes": Array<string>
    "startDate": Date
    "endDate": Date
    "location": string
    "name": string
    "description": string
    "allowOnlineEntry": boolean
    "allowOnlinePayment": boolean
    "unofficial": boolean
    "allowOwnerMembershipPriority": boolean
    "allowHandlerMembershipPriority": boolean
    "cost": number
    "costMember": number
    "paymentDetails": string
    "accountNumber": string
    "referenceNumber": string
    "requirePaymentBeforeEntry": boolean
    "judges": Array<number>
    "official": number   
    "createdAt": string
    "createdBy": string
    "modifiedAt": string
    "modifiedBy": string
}