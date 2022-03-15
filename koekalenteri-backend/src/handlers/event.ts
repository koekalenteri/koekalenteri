import { APIGatewayProxyEvent } from "aws-lambda";
import { Event, JsonRegistration } from "koekalenteri-shared/model";
import CustomDynamoClient from "../utils/CustomDynamoClient";
import { genericWriteHandler, genericReadAllHandler, genericReadHandler } from "../utils/genericHandlers";
import { sendTemplatedMail } from "./email";

const dynamoDB = new CustomDynamoClient();

export const getEventsHandler = genericReadAllHandler(dynamoDB, 'getEvents');
export const getEventHandler = genericReadHandler(dynamoDB, 'getEvent');
export const putEventHandler = genericWriteHandler(dynamoDB, 'putEvent');

export const putRegistrationHandler = async (e: APIGatewayProxyEvent) => {
  const dbResult = await genericWriteHandler(dynamoDB, 'putRegistration')(e);
  if (dbResult.statusCode === 200) {
    const registration = JSON.parse(dbResult.body) as JsonRegistration;
    const eventKey = { eventType: registration.eventType, id: registration.eventId };
    const eventTable = process.env.EVENT_TABLE_NAME || '';
    // const event = await dynamoDB.readTable(process.env.EVENT_TABLE_NAME || '', eventKey) as Event;
    const registrations = await dynamoDB.query('eventId = :id', { ':id': registration.eventId });

    dynamoDB.update(eventTable, eventKey, 'set entries = :entries', { ':entries': registrations?.length || 0 });

    //event.entries
    const to: string[] = [registration.handler.email];
    if (registration.owner.email !== registration.handler.email) {
      to.push(registration.owner.email);
    }
    await sendTemplatedMail('RegistrationFI', to, {});
  }
  return dbResult;
}
