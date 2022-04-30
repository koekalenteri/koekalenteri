import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import CustomDynamoClient from "../utils/CustomDynamoClient";
import KLAPI from "../utils/KLAPI";
import { KLYhdistysRajaus } from "../utils/KLAPI_models";
import { metricsError, metricsSuccess } from "../utils/metrics";
import { response } from "../utils/response";

const dynamoDB = new CustomDynamoClient();
const klapi = new KLAPI();

export const getOrganizersHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
        const { status, json } = await klapi.lueYhdistykset({ Rajaus: KLYhdistysRajaus.Koejärjestätä });
        if (status === 200 && json) {
          for (const item of json) {
            await dynamoDB.write({ id: item.jäsennumero, name: item.strYhdistys });
          }
        }
      }
      const items = await dynamoDB.readAll();
      metricsSuccess(metrics, event.requestContext, 'getOrganizers');
      return response(200, items);
    } catch (err) {
      console.error(err);
      metricsError(metrics, event.requestContext, 'getOrganizers');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

