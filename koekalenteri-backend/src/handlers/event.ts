import CustomDynamoClient from "../utils/CustomDynamoClient";
import { genericWriteHandler, genericReadAllHandler, genericReadHandler } from "../utils/genericHandlers";

const dynamoDB = new CustomDynamoClient();

export const getEventsHandler = genericReadAllHandler(dynamoDB, 'getEvents');
export const getEventHandler = genericReadHandler(dynamoDB, 'getEvent');
export const putEventHandler = genericWriteHandler(dynamoDB, 'putEvent');
