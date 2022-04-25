import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import CustomDynamoClient from "../utils/CustomDynamoClient";
import KLAPI from "../utils/KLAPI";
import { KLKieli } from "../utils/KLAPI_models";
import { metricsError, metricsSuccess } from "../utils/metrics";
import { response } from "../utils/response";

const dynamoDB = new CustomDynamoClient();
const klapi = new KLAPI();

export const getJudgesHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
        for (const eventType of ['NOU', 'NOME-B', 'NOWT', 'NOME-A', 'NKM']) {
          const { status, json } = await klapi.lueKoemuodonYlituomarit({ Koemuoto: eventType, Kieli: KLKieli.Suomi });
          if (status === 200 && json) {
            for (const item of json) {
              await dynamoDB.write({
                id: item.jäsennumero,
                name: capitalize(item.nimi),
                location: capitalize(item.paikkakunta),
                district: item.kennelpiiri,
                email: item.sähköposti,
                phone: item.puhelin,
                eventTypes: item.koemuodot.map(koemuoto => koemuoto.lyhenne)
              });
            }
          }
        }
      }
      const items = await dynamoDB.readAll();
      metricsSuccess(metrics, event.requestContext, 'refreshJudges');
      return response(200, items);
    } catch (err) {
      console.error(err);
      metricsError(metrics, event.requestContext, 'refreshJudges');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

export function capitalize(s: string) {
  return s.toLowerCase().replace(/(^|[ -])[^ -]/g, (l: string) => l.toUpperCase());
}
