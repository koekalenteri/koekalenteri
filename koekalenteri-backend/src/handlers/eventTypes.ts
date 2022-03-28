import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { metricsError, metricsSuccess } from "../utils/metrics";
import { response } from "../utils/response";
import KLAPI from "../utils/KLAPI";
import { KLKieli } from "../utils/KLAPI_models";

const klapi = new KLAPI();

export const getEventTypesHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const { status, json } = await klapi.lueKoemuodot({Kieli: KLKieli.Suomi});

      // TESTEJÄ
      // 200
      //const { status, json } = await klapi.lueKoiranPerustiedot({ Rekisterinumero: 'FI10090/20', Kieli: KLKieli.Suomi });
      //const { status, json } = await klapi.lueKoetulokset({ Koemuoto: 'NOME-B', Kieli: KLKieli.Suomi });

      // 403
      //const { status, json } = await klapi.lueYhdistykset({ KennelpiirinNumero: 1, Rajaus: KLYhdistysRajaus.Koejärjestätä });

      // 404
      // Yleista/Lue/Paikkakunnat

      // 500
      //const { status, json } = await klapi.lueKennelpiirit();
      //const { status, json } = await klapi.lueKoemuodonKoetoimitsijat({ Koemuoto: 'NOME-B', Kieli: KLKieli.Suomi });
      //const { status, json } = await klapi.lueKoemuodonTarkenteet({ Kieli: KLKieli.Suomi, Koemuoto: 'NOME-B' });
      //const { status, json } = await klapi.lueKoemuodonYlituomarit({ Kieli: KLKieli.Suomi, Koemuoto: 'NOME-B' });
      //const { status, json } = await klapi.lueKoemuodot({Kieli: KLKieli.Suomi});
      //const { status, json } = await klapi.luePaikkakunnat({});
      //const { status, json } = await klapi.lueParametrit({Kieli: KLKieli.Suomi, Parametri: KLParametri.TapahtumienTyypit});
      //const { status, json } = await klapi.lueRodut({ Kieli: KLKieli.Suomi, Rajaus: KLRotuRajaus.Kaikki });
      //const { status, json } = await klapi.lueRoturyhmät({Kieli: KLKieli.Suomi})

      metricsSuccess(metrics, event.requestContext, 'getEventTypesHandler');
      return response(status, json);
    } catch (err) {
      console.error(err);
      metricsError(metrics, event.requestContext, 'getEventTypesHandler');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

