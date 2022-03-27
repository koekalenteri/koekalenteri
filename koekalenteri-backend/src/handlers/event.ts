import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from 'uuid';
import { JsonConfirmedEvent, JsonRegistration } from "koekalenteri-shared/model";
import CustomDynamoClient from "../utils/CustomDynamoClient";
import { formatDateSpan, formatRegDate } from "../utils/dates";
import { genericWriteHandler, genericReadAllHandler, genericReadHandler, getUsername } from "../utils/genericHandlers";
import { metricsSuccess, metricsError } from "../utils/metrics";
import { sendTemplatedMail } from "./email";
import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { response } from "../utils/response";
import { AWSError } from "aws-sdk";

const dynamoDB = new CustomDynamoClient();

export const getEventsHandler = genericReadAllHandler(dynamoDB, 'getEvents');
export const getEventHandler = genericReadHandler(dynamoDB, 'getEvent');
export const putEventHandler = genericWriteHandler(dynamoDB, 'putEvent');

export const getRegistrationsHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': event.pathParameters?.eventId });
      metricsSuccess(metrics, event.requestContext, 'getRegistrations');
      return response(200, items);
    } catch (err: any) {
      metricsError(metrics, event.requestContext, 'getRegistrations');
      return response(err.statusCode || 501, err);
    }
  }
);

export const putRegistrationHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {

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
      if (item.id === '') {
        item.id = uuidv4();
      }
      const eventKey = { eventType: item.eventType, id: item.eventId };
      const eventTable = process.env.EVENT_TABLE_NAME || '';
      const confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>(eventKey, eventTable);
      if (!confirmedEvent) {
        throw new Error(`Event of type "${item.eventType}" not found with id "${item.eventId}"`);
      }
      await dynamoDB.write(item);
      const registrations = await dynamoDB.query<JsonRegistration>('eventId = :id', { ':id': item.eventId });

      const membershipPriority = (r: JsonRegistration) =>
        (confirmedEvent.allowHandlerMembershipPriority && r.handler?.membership)
        || (confirmedEvent.allowOwnerMembershipPriority && r.owner?.membership);

      for (const cls of confirmedEvent.classes || []) {
        const regsToClass = registrations?.filter(r => r.class === cls.class);
        cls.entries = regsToClass?.length;
        cls.members = regsToClass?.filter(r => membershipPriority(r)).length
      }
      await dynamoDB.update(eventKey, 'set entries = :entries, classes = :classes', { ':entries': registrations?.length || 0, ':classes': confirmedEvent.classes }, eventTable);

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
    } catch (err) {
      metricsError(metrics, event.requestContext, 'putRegistration');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);
