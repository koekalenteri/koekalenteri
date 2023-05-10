import CustomDynamoClient from '../utils/CustomDynamoClient'
import { genericReadAllHandler, genericReadHandler } from '../utils/genericHandlers'

const dynamoDB = new CustomDynamoClient()

export const getEventsHandler = genericReadAllHandler(dynamoDB, 'getEvents')
export const getEventHandler = genericReadHandler(dynamoDB, 'getEvent')
