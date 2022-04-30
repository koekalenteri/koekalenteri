import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { Official } from "koekalenteri-shared/model";
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
        // TODO: use enabled event types
        for (const eventType of ['NOU', 'NOME-B', 'NOWT', 'NOME-A', 'NKM']) {
          const { status, json } = await klapi.lueKoemuodonKoetoimitsijat({Koemuoto: eventType, Kieli: KLKieli.Suomi})
          if (status === 200 && json) {
            console.log('test');
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
                eventTypes: item.koemuodot.map(koemuoto => koemuoto.lyhenne)
              })
            }
          }
        }
      }
      const items = await dynamoDB.readAll();
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

