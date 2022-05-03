import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { EventType, Judge } from "koekalenteri-shared/model";
import CustomDynamoClient from "../utils/CustomDynamoClient";
import { genericWriteHandler } from "../utils/genericHandlers";
import KLAPI from "../utils/KLAPI";
import { KLKieli } from "../utils/KLAPI_models";
import { metricsError, metricsSuccess } from "../utils/metrics";
import { response } from "../utils/response";
import { capitalize } from "../utils/string";

const dynamoDB = new CustomDynamoClient();
const klapi = new KLAPI();

export const getJudgesHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
        const eventTypeTable = process.env.EVENT_TYPE_TABLE_NAME || '';
        const eventTypes = (await dynamoDB.readAll<EventType>(eventTypeTable))?.filter(et => et.active) || [];
        for (const eventType of eventTypes) {
          const { status, json } = await klapi.lueKoemuodonYlituomarit({ Koemuoto: eventType.eventType, Kieli: KLKieli.Suomi });
          if (status === 200 && json) {
            for (const item of json) {
              const existing = await dynamoDB.read<Judge>({ id: item.jäsennumero });
              await dynamoDB.write({
                active: true,
                ...existing,
                id: item.jäsennumero,
                name: capitalize(item.nimi),
                location: capitalize(item.paikkakunta),
                district: item.kennelpiiri,
                email: item.sähköposti,
                phone: item.puhelin,
                eventTypes: item.koemuodot.map(koemuoto => koemuoto.lyhenne),
                official: true
              });
            }
          }
        }
      }
      const items = await dynamoDB.readAll();
      metricsSuccess(metrics, event.requestContext, 'getJudges');
      return response(200, items);
    } catch (err) {
      console.error(err);
      metricsError(metrics, event.requestContext, 'getJudges');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

export const putJudgeHandler = genericWriteHandler(dynamoDB, 'putJudge');
