import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { EventType, JsonDbRecord, Official } from "koekalenteri-shared/model";
import { capitalize } from "../utils/string";
import CustomDynamoClient from "../utils/CustomDynamoClient";
import KLAPI from "../utils/KLAPI";
import { KLKieli } from "../utils/KLAPI_models";
import { metricsError, metricsSuccess } from "../utils/metrics";
import { response } from "../utils/response";

const dynamoDB = new CustomDynamoClient();
const klapi = new KLAPI();

export const getOfficialsHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
        const eventTypeTable = process.env.EVENT_TYPE_TABLE_NAME || '';
        const eventTypes = (await dynamoDB.readAll<EventType>(eventTypeTable))?.filter(et => et.active) || [];
        for (const eventType of eventTypes) {
          const { status, json } = await klapi.lueKoemuodonKoetoimitsijat({Koemuoto: eventType.eventType, Kieli: KLKieli.Suomi})
          if (status === 200 && json) {
            for (const item of json) {
              const existing = await dynamoDB.read<Official>({ id: item.jäsennumero });
              dynamoDB.write({
                ...existing,
                id: item.jäsennumero,
                name: capitalize(item.nimi),
                location: capitalize(item.paikkakunta),
                district: item.kennelpiiri,
                email: item.sähköposti,
                phone: item.puhelin,
                eventTypes: item.koemuodot.map(koemuoto => koemuoto.lyhenne),
                deletedAt: false,
                deletedBy: '',
              })
            }
          }
        }
      }
      const items = (await dynamoDB.readAll<Official & JsonDbRecord>())?.filter(o => !o.deletedAt);
      metricsSuccess(metrics, event.requestContext, 'getOfficials');
      return response(200, items);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        console.error(err.message);
      }
      metricsError(metrics, event.requestContext, 'getOfficials');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

