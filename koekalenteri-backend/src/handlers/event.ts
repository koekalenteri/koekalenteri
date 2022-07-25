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
    const origin = event.headers['Origin'];

    try {
      let existing;
      const registration: JsonRegistration = JSON.parse(event.body || "");
      const update = !!registration.id;
      if (update) {
        existing = await dynamoDB.read<JsonRegistration>({ eventId: registration.eventId, id: registration.id });
        if (!existing) {
          throw new Error(`Registration not found with id "${registration.id}"`);
        }
      } else {
        registration.id = uuidv4();
        registration.createdAt = timestamp;
        registration.createdBy = username;
      }

      // modification info is always updated
      registration.modifiedAt = timestamp;
      registration.modifiedBy = username;

      const t = i18n.getFixedT(registration.language);

      const eventKey = { eventType: registration.eventType, id: registration.eventId };
      const eventTable = process.env.EVENT_TABLE_NAME || '';
      const confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>(eventKey, eventTable);
      if (!confirmedEvent) {
        throw new Error(`Event of type "${registration.eventType}" not found with id "${registration.eventId}"`);
      }

      const data = { ...existing, ...registration };
      await dynamoDB.write(data);

      const registrations = await dynamoDB.query<JsonRegistration>('eventId = :id', { ':id': registration.eventId });

      const membershipPriority = (r: JsonRegistration) =>
        (confirmedEvent.allowHandlerMembershipPriority && r.handler?.membership)
        || (confirmedEvent.allowOwnerMembershipPriority && r.owner?.membership);

      const classes = confirmedEvent.classes || [];
      for (const cls of classes) {
        const regsToClass = registrations?.filter(r => r.class === cls.class);
        cls.entries = regsToClass?.length;
        cls.members = regsToClass?.filter(r => membershipPriority(r)).length
      }
      const entries = registrations?.length || 0;
      await dynamoDB.update(eventKey,
        'set entries = :entries, classes = :classes',
        {
          ':entries': entries,
          ':classes': classes
        },
        eventTable
      );

      if (registration.handler?.email && registration.owner?.email) {
        const to: string[] = [registration.handler.email];
        if (registration.owner.email !== registration.handler.email) {
          to.push(registration.owner.email);
        }
        const eventDate = formatDateSpan(confirmedEvent.startDate, confirmedEvent.endDate);
        const reserveText = t(`registration.reserveChoises.${registration.reserve}`);
        const dogBreed = t(`breed:${registration.dog.breedCode}`);
        const regDates = registration.dates.map(d => t('weekday', { date: d.date }) + ' ' + t(`registration.time.${d.time}`)).join(', ');
        const link = `${origin}/registration/${registration.eventType}/${registration.eventId}/${registration.id}`;
        // TODO: sender address from env / other config
        const from = "koekalenteri@koekalenteri.snj.fi";
        const qualifyingResults = registration.qualifyingResults.map(r => ({ ...r, date: lightFormat(parseISO(r.date), 'd.M.yyyy') }));
        await sendTemplatedMail('RegistrationV2', registration.language, from, to, {
          subject: t('registration.email.subject', { context: update ? 'update' : '' }),
          title: t('registration.email.title', { context: update ? 'update' : '' }),
          dogBreed,
          link,
          event: confirmedEvent,
          eventDate,
          qualifyingResults,
          reg: registration,
          regDates,
          reserveText,
        });
      }

      metricsSuccess(metrics, event.requestContext, 'putRegistration');
      return response(200, registration);
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
