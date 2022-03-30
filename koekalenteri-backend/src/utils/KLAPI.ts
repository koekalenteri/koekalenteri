import { SSM } from 'aws-sdk';
import fetch from 'node-fetch';
import type { JsonArray, JsonObject } from 'koekalenteri-shared/model';
import type {
  KLAPIConfig, KLAPIResult, KLArvo, KLKennelpiiri, KLKoeHenkilö, KLKoemuodonTarkenne, KLKoemuodonTulos,
  KLKoemuodotParametrit, KLKoemuoto, KLKoemuotoParametrit, KLKoetapahtuma,
  KLKoetapahtumaParametrit, KLKoetulos, KLKoetulosParametrit, KLKoira, KLKoiraParametrit,
  KLPaikkakunta, KLParametritParametrit, KLRodutParametrit, KLRotu, KLRoturyhmätParametrit,
  KLRoturyhmä, KLYhdistys, KLYhdistysParametrit
} from './KLAPI_models';

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

function toURLParams(params: Record<string, string | number | undefined> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const param in params) {
    const value = params[param];
    if (typeof value === 'undefined') {
      continue;
    }
    if (typeof value === 'number') {
      result[param] = value.toString();
    } else {
      result[param] = value;
    }
  }
  return result;
}
export default class KLAPI {
  private _config?: KLAPIConfig

  private async _getConfig(): Promise<KLAPIConfig> {
    if (!this._config) {
      this._config = await getSSMParams(['KL_API_URL', 'KL_API_UID', 'KL_API_PWD']) as KLAPIConfig;
    }

    if (!this._config.KL_API_URL) {
      throw new Error('Missing KLAPI Config!')
    }

    return this._config;
  }

  private async get<T extends JsonObject | JsonArray>(path: string, params?: Record<string, string | number | undefined>): KLAPIResult<T> {
    const cfg = await this._getConfig();
    const sp = new URLSearchParams(toURLParams(params));
    console.log(`KLAPI: ${path}?${sp}`);
    let json: T | undefined;
    let status = 204;
    let error;
    try {
      const res = await fetch(`${cfg.KL_API_URL}/${path}?` + sp, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Kayttajatunnus': cfg.KL_API_UID,
          'X-Salasana': cfg.KL_API_PWD
        }
      });
      status = res.status;
      try {
        json = res.ok && await res.json();
        if (json) {
          console.log('response: ' + JSON.stringify(json));
        } else {
          error = await res.text();
          console.error('not ok', status, error);
        }
      } catch (jse) {
        console.error(jse);
        console.log(status, JSON.stringify(res));
      }
    } catch (e: unknown) {
      console.error(e);
      if (e instanceof Error) {
        error = e.message;
      }
    }
    return { status, error, json };
  }

  async lueKoiranPerustiedot(parametrit: KLKoiraParametrit): KLAPIResult<KLKoira> {
    if (!parametrit.Rekisterinumero && !parametrit.Tunnistusmerkintä) {
      return { status: 404 };
    }
    return this.get('Koira/Lue/Perustiedot', parametrit);
  }

  async lueKoiranKoetulokset(parametrit: KLKoetulosParametrit): KLAPIResult<Array<KLKoetulos>> {
    if (!parametrit.Rekisterinumero) {
      return { status: 404 };
    }
    return this.get('Koira/Lue/Koetulokset', parametrit);
  }

  async lueKoemuodot(parametrit: KLKoemuodotParametrit): KLAPIResult<Array<KLKoemuoto>> {
    return this.get('Koemuoto/Lue/Koemuodot', parametrit);
  }

  async lueKoetulokset(parametrit: KLKoemuotoParametrit): KLAPIResult<Array<KLKoemuodonTulos>> {
    return this.get('Koemuoto/Lue/Tulokset', parametrit);
  }

  async lueKoemuodonTarkenteet(parametrit: KLKoemuotoParametrit): KLAPIResult<Array<KLKoemuodonTarkenne>> {
    return this.get('Koemuoto/Lue/Tarkenteet', parametrit);
  }

  async lueKoemuodonYlituomarit(parametrit: KLKoemuotoParametrit): KLAPIResult<Array<KLKoeHenkilö>> {
    return this.get('Koemuoto/Lue/Ylituomarit', parametrit);
  }

  async lueKoemuodonKoetoimitsijat(parametrit: KLKoemuotoParametrit): KLAPIResult<Array<KLKoeHenkilö>> {
    return this.get('Koemuoto/Lue/Koetoimitsijat', parametrit);
  }

  async lueKoetapahtumat(parametrit: KLKoetapahtumaParametrit): KLAPIResult<Array<KLKoetapahtuma>> {
    return this.get('Koe/Lue/Koetapahtumat', parametrit);
  }

  async lueKennelpiirit(): KLAPIResult<Array<KLKennelpiiri>> {
    return this.get('Yleistä/Lue/Kennelpiirit');
  }

  async luePaikkakunnat(parametrit: { KennelpiirinNumero?: number }): KLAPIResult<Array<KLPaikkakunta>> {
    return this.get('Yleistä/Lue/Paikkakunnat', parametrit);
  }

  async lueYhdistykset(parametrit: KLYhdistysParametrit): KLAPIResult<Array<KLYhdistys>> {
    return this.get('Yleistä/Lue/Yhdistykset', parametrit);
  }

  async lueParametrit(parametrit: KLParametritParametrit): KLAPIResult<Array<KLArvo>> {
    return this.get('Yleistä/Lue/Parametrit', parametrit);
  }

  async lueRoturyhmät(parametrit: KLRoturyhmätParametrit): KLAPIResult<Array<KLRoturyhmä>> {
    return this.get('Yleistä/Lue/Roturyhmät', parametrit);
  }

  async lueRodut(parametrit: KLRodutParametrit): KLAPIResult<Array<KLRotu>> {
    return this.get('Yleistä/Lue/Rodut', parametrit);
  }
}
