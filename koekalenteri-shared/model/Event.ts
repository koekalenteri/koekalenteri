export type Event = {
    id: string
    "event-type": string
    "classes": [string]
    "start-date": Date
    "end-date": Date
    "location": string
    "name": string
    "description": string
    "allow-online-entry": boolean
    "allow-online-payment": boolean
    "unofficial": boolean
    "allow-owner-membership-priority": boolean
    "allow-handler-membership-priority": boolean
    "cost": number
    "cost-member": number
    "payment-details": string
    "account-number": string
    "reference-number": string
    "require-payment-before-entry": boolean
    "judges": [number]
    "official": number   
    "created-at": string
    "created-by": string
    "modified-at": string
    "modified-by": string
}