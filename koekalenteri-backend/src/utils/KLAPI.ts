import { SSM } from 'aws-sdk';
import fetch from 'node-fetch';
import { KLDog } from 'koekalenteri-shared/model';

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

type KLAPIConfig = {
  KL_API_URL: string,
  KL_API_UID: string,
  KL_API_PWD: string
}

export type KLAPIResult<T> = {
  status: number,
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

  async get<T>(path: string, params: Record<string, string>): Promise<KLAPIResult<T>> {
    const cfg = await this._getConfig();
    const sp = new URLSearchParams(params);
    console.log(`KLAPI: ${path}?${sp}`);
    const res = await fetch(`${cfg.KL_API_URL}/${path}?` + sp, {
      headers: {
        method: 'GET',
        "X-Kayttajatunnus": cfg.KL_API_UID,
        "X-Salasana": cfg.KL_API_PWD
      }
    });
    return { status: res.status, json: await res.json() };
  }

  async lueKoiranPerustiedot(regno?: string, lang?: KLKieli): Promise<KLAPIResult<KLDog>> {
    if (!regno || !lang) {
      return { status: 404 };
    }
    return this.get('Koira/Lue/Perustiedot', {
      Rekisterinumero: regno,
      Kieli: lang
    });
  }
}
