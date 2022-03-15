import { SSM } from 'aws-sdk';
import { JsonArray, JsonObject } from 'koekalenteri-shared/model';
import fetch from 'node-fetch';
import { KLAPIConfig, KLDog, KLKoemuoto, KLTestResults } from './KLAPI_models';

export type KLKieli = '1' | '2' | '3';

const ssm = new SSM();

type ValuesOf<T extends string[]> = T[number];
type ParamsFromKeys<T extends string[]> = { [key in ValuesOf<T>]: string };

async function getSSMParams(names: string[]): Promise<ParamsFromKeys<typeof names>> {
  const result = await ssm.getParameters({ Names: names }).promise();
  const values: ParamsFromKeys<typeof names> = {};
  const params = result.Parameters || [];
  for (const name of names) {
    values[name] = params.find(p => p.Name === name)?.Value || '';
  }
  return values;
}

export type KLAPIResult<T> = {
  status: number
  error?: string
  json?: T
}

export default class KLAPI {
  private _config?: KLAPIConfig

  async _getConfig(): Promise<KLAPIConfig> {
    if (!this._config) {
      this._config = await getSSMParams(['KL_API_URL', 'KL_API_UID', 'KL_API_PWD']) as KLAPIConfig;
    }

    if (!this._config.KL_API_URL) {
      throw new Error('Missing KLAPI Config!')
    }

    return this._config;
  }

  async get<T extends JsonObject|JsonArray>(path: string, params: Record<string, string>): Promise<KLAPIResult<T>> {
    const cfg = await this._getConfig();
    const sp = new URLSearchParams(params);
    console.log(`KLAPI: ${path}?${sp}`);
    let json: T | undefined;
    let status = 204;
    let error;
    try {
      const res = await fetch(`${cfg.KL_API_URL}/${path}?` + sp, {
        headers: {
          method: 'GET',
          "X-Kayttajatunnus": cfg.KL_API_UID,
          "X-Salasana": cfg.KL_API_PWD
        }
      });
      status = res.status;
      json = await res.json();
      if (json) {
        console.log('response: ' + JSON.stringify(json));
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        error = e.message;
      }
    }
    return { status, error, json };
  }

  async lueKoiranPerustiedot(regno?: string, lang: KLKieli = '1'): Promise<KLAPIResult<KLDog>> {
    if (!regno) {
      return { status: 404 };
    }
    return this.get('Koira/Lue/Perustiedot', {
      Rekisterinumero: regno,
      Kieli: lang
    });
  }

  async lueKoiranKoetulokset(regno?: string, lang: KLKieli = '1'): Promise<KLAPIResult<KLTestResults>> {
    if (!regno) {
      return { status: 404 };
    }
    return this.get('Koira/Lue/Koetulokset', {
      Rekisterinumero: regno,
      Kieli: lang
    });
  }

  async lueKoemuodot(breedCode?: string, lang: KLKieli = '1'): Promise<KLAPIResult<KLKoemuoto>> {
    return this.get('Koemuoto/Lue/Koemuodot', {
      Rotukoodi: breedCode || '',
      Kieli: lang
    });
  }
}
