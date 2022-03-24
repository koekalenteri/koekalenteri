import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from 'uuid';
import { JsonConfirmedEvent, JsonRegistration } from "shared";
import { CustomDynamoClient } from "../utils/CustomDynamoClient.mjs";
import { formatDateSpan, formatRegDate } from "../utils/dates.mjs";
import { genericWriteHandler, genericReadAllHandler, genericReadHandler, getUsername } from "../utils/genericHandlers.mjs";
import { metricsSuccess, metricsError } from "../utils/metrics.mjs";
import { sendTemplatedMail } from "./email.mjs";
import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { response } from "../utils/response.mjs";

const dynamoDB = new CustomDynamoClient();

export const getEventsHandler = genericReadAllHandler(dynamoDB, 'getEvents');
export const getEventHandler = genericReadHandler(dynamoDB, 'getEvent');
export const putEventHandler = genericWriteHandler(dynamoDB, 'putEvent');

export const putRegistrationHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    console.log('!');
    const timestamp = new Date().toISOString();
    const username = getUsername(event);

    try {
      const item: JsonRegistration = {
        id: uuidv4(),
        ...JSON.parse(event.body || ""),
        createdAt: timestamp,
        createdBy: username,
        modifiedAt: timestamp,
        modifiedBy: username,
      }
      const eventKey = { eventType: item.eventType, id: item.eventId };
      const eventTable = process.env.EVENT_TABLE_NAME || '';
      const confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>(eventKey, eventTable);
      if (!confirmedEvent) {
        throw new Error(`Event of type "${item.eventType}" not found with id "${item.eventId}"`);
      }
      await dynamoDB.write(item);
      const registrations = await dynamoDB.query('eventId = :id', { ':id': item.eventId });
      await dynamoDB.update(eventKey, 'set entries = :entries', { ':entries': registrations?.length || 0 }, eventTable);

      if (item.handler?.email && item.owner?.email) {
        const to: string[] = [item.handler.email];
        if (item.owner.email !== item.handler.email) {
          to.push(item.owner.email);
        }
        const eventDate = formatDateSpan(confirmedEvent.startDate, confirmedEvent.endDate);
        // TODO: i18n for backend or include additional data in registration?
        const reserveText = item.reserve;
        const dogBreed = item.dog.breedCode;
        const regDates = item.dates.map(d => formatRegDate(d.date, d.time)).join(', ');
        // TODO: link
        const editLink = 'https://localhost:3000/registration/' + item.id;
        // TODO: sender address from env / other config
        const from = "koekalenteri@koekalenteri.snj.fi";
        await sendTemplatedMail('RegistrationV2', item.language, from, to, {
          dogBreed,
          editLink,
          event: confirmedEvent,
          eventDate,
          reg: item,
          regDates,
          reserveText,
        });
      }

      metricsSuccess(metrics, event.requestContext, 'putRegistration');
      return response(200, item);
    } catch (err: any) {
      metricsError(metrics, event.requestContext, 'putRegistration');
      return response(err.statusCode || 501, err);
    }
  }
);
