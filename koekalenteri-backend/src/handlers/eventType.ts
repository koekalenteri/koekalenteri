import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { EventType, JsonDbRecord, Judge, Official } from "koekalenteri-shared/model";
import CustomDynamoClient from "../utils/CustomDynamoClient";
import { authorize, createDbRecord, getUsername } from "../utils/genericHandlers";
import KLAPI from "../utils/KLAPI";
import { KLKieli, KLKieliToLang } from "../utils/KLAPI_models";
import { metricsError, metricsSuccess } from "../utils/metrics";
import { response } from "../utils/response";

const dynamoDB = new CustomDynamoClient();
const klapi = new KLAPI();

export const getEventTypesHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
        for (const kieli of [KLKieli.Suomi, KLKieli.Ruotsi, KLKieli.Englanti]) {
          const { status, json } = await klapi.lueKoemuodot({ Kieli: kieli });
          if (status === 200 && json) {
            for (const item of json) {
              const existing = await dynamoDB.read<EventType>({ eventType: item.lyhenne });
              dynamoDB.write({
                ...existing,
                eventType: item.lyhenne,
                description: {
                  ...existing?.description,
                  [KLKieliToLang[kieli]]: item.koemuoto
                },
                official: true
              })
            }
          }
        }
      }
      const items = await dynamoDB.readAll();
      metricsSuccess(metrics, event.requestContext, 'getEventTypes');
      return response(200, items);
    } catch (err) {
      console.error(err);
      metricsError(metrics, event.requestContext, 'getEventTypes');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

export const putEventTypeHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    authorize(event);

    const timestamp = new Date().toISOString();
    const username = getUsername(event);

    try {
      const item = createDbRecord(event, timestamp, username);
      await dynamoDB.write(item);
      if (!item.active) {
        const active = (await dynamoDB.readAll<EventType>())?.filter(et => et.active) || [];

        const judgeTable = process.env.JUDGE_TABLE_NAME;
        const judgesToRemove = (await dynamoDB.readAll<Judge & JsonDbRecord>(judgeTable))
          ?.filter(j => !j.deletedAt && !active.some(et => j.eventTypes?.includes(et.eventType))) || [];
        for (const judge of judgesToRemove) {
          await dynamoDB.write({
            ...judge,
            deletedAt: timestamp,
            deletedBy: username
          }, judgeTable);
        }

        const officialTable = process.env.OFFICIAL_TABLE_NAME;
        const officialsToRemove = (await dynamoDB.readAll<Official & JsonDbRecord>(officialTable))
          ?.filter(o => !o.deletedAt && !active.some(et => o.eventTypes?.includes(et.eventType))) || [];
        for (const official of officialsToRemove) {
          await dynamoDB.write({
            ...official,
            deletedAt: timestamp,
            deletedBy: username
          }, officialTable);
        }
      }
      metricsSuccess(metrics, event.requestContext, 'putEventType');
      return response(200, item);
    } catch (err) {
      console.error(err);
      metricsError(metrics, event.requestContext, 'putEventType');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

