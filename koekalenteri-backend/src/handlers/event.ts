import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { lightFormat, parseISO } from "date-fns";
import { JsonConfirmedEvent, JsonRegistration } from "koekalenteri-shared/model";
import { v4 as uuidv4 } from 'uuid';
import { i18n } from "../i18n";
import CustomDynamoClient from "../utils/CustomDynamoClient";
import { formatDateSpan } from "../utils/dates";
import { authorize, genericReadAllHandler, genericReadHandler, getUsername } from "../utils/genericHandlers";
import { metricsError, metricsSuccess } from "../utils/metrics";
import { response } from "../utils/response";
import { sendTemplatedMail } from "./email";

const dynamoDB = new CustomDynamoClient();

export const getEventsHandler = genericReadAllHandler(dynamoDB, 'getEvents');
export const getEventHandler = genericReadHandler(dynamoDB, 'getEvent');
export const putEventHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    authorize(event);

    const timestamp = new Date().toISOString();
    const username = getUsername(event);

    try {
      let existing;
      const item: JsonConfirmedEvent = JSON.parse(event.body || "");
      if (item.id) {
        existing = await dynamoDB.read<JsonConfirmedEvent>({ eventType: item.eventType, id: item.id });
      } else {
        item.id = uuidv4();
        item.createdAt = timestamp;
        item.createdBy = username;
      }

      if (
        existing?.state === 'confirmed'
        && existing.entryEndDate
        && !existing.entryOrigEndDate
        && item.entryEndDate
        && item.entryEndDate > existing.entryEndDate
      ) {
        // entry period was extended, use additional field to store the original entry end date
        item.entryOrigEndDate = existing.entryEndDate;
      }

      // modification info is always updated
      item.modifiedAt = timestamp;
      item.modifiedBy = username;

      const data = { ...existing, ...item };
      await dynamoDB.write(data);
      metricsSuccess(metrics, event.requestContext, 'putEvent');
      return response(200, data);
    } catch (err) {
      metricsError(metrics, event.requestContext, 'putEvent');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
)

export const getRegistrationsHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const items = await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': event.pathParameters?.eventId });
      metricsSuccess(metrics, event.requestContext, 'getRegistrations');
      return response(200, items);
    } catch (err: unknown) {
      metricsError(metrics, event.requestContext, 'getRegistrations');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

export const getRegistrationHandler = genericReadHandler(dynamoDB, 'getRegistration');

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
      const t = i18n.getFixedT(item.language);
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
        const reserveText = t(`registration.reserveChoises.${item.reserve}`);
        const dogBreed = t(`breed:${item.dog.breedCode}`);
        const regDates = item.dates.map(d => t('weekday', { date: d.date }) + ' ' + t(`registration.time.${d.time}`)).join(', ');
        // TODO: link
        const editLink = 'https://localhost:3000/registration/' + item.id;
        // TODO: sender address from env / other config
        const from = "koekalenteri@koekalenteri.snj.fi";
        const qualifyingResults = item.qualifyingResults.map(r => ({ ...r, date: lightFormat(parseISO(r.date), 'd.M.yyyy') }));
        await sendTemplatedMail('RegistrationV2', item.language, from, to, {
          dogBreed,
          editLink,
          event: confirmedEvent,
          eventDate,
          qualifyingResults,
          reg: item,
          regDates,
          reserveText,
        });
      }

      metricsSuccess(metrics, event.requestContext, 'putRegistration');
      return response(200, item);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        console.error(err.message);
      }
      metricsError(metrics, event.requestContext, 'putRegistration');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);
