import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { EventType } from "koekalenteri-shared/model";
import CustomDynamoClient from "../utils/CustomDynamoClient";
import { genericWriteHandler } from "../utils/genericHandlers";
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
      metricsSuccess(metrics, event.requestContext, 'getEventTypesHandler');
      return response(200, items);
    } catch (err) {
      console.error(err);
      metricsError(metrics, event.requestContext, 'getEventTypesHandler');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

export const putEventTypeHandler = genericWriteHandler(dynamoDB, 'putEventType');
