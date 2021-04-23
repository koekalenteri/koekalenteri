export type Event = {
    id: String
    "event-type": String
    "classes": [String]
    "start-date": Date
    "end-date": Date
    "location": String
    "name": String
    "description": String
    "allow-online-entry": Boolean
    "allow-online-payment": Boolean
    "unofficial": Boolean
    "allow-owner-membership-priority": Boolean
    "allow-handler-membership-priority": Boolean
    "cost": Number
    "cost-member": Number
    "payment-details": String
    "account-number": String
    "reference-number": String
    "require-payment-before-entry": Boolean
    "judges": [Number]
    "official": Number   
    "created-at": String
    "created-by": String
    "modified-at": String
    "modified-by": String
}