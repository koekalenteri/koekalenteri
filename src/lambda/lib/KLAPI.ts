import type { JsonArray, JsonObject } from '../../types'
import type {
  KLAPIConfig,
  KLAPIResult,
  KLArvo,
  KLKennelpiiri,
  KLKoeHenkilö,
  KLKoemuodonTarkenne,
  KLKoemuodonTulos,
  KLKoemuodotParametrit,
  KLKoemuoto,
  KLKoemuotoParametrit,
  KLKoetapahtuma,
  KLKoetapahtumaParametrit,
  KLKoetulos,
  KLKoetulosParametrit,
  KLKoira,
  KLKoiraParametrit,
  KLPaikkakunta,
  KLParametritParametrit,
  KLRodutParametrit,
  KLRotu,
  KLRoturyhmä,
  KLRoturyhmätParametrit,
  KLYhdistys,
  KLYhdistysParametrit,
} from '../types/KLAPI'

function toURLParams(params: Record<string, string | number | undefined> = {}): Record<string, string> {
  const result: Record<string, string> = {}
  for (const param in params) {
    const value = params[param]
    if (typeof value === 'undefined') {
      continue
    }
    if (typeof value === 'number') {
      result[param] = value.toString()
    } else {
      result[param] = value
    }
  }
  return result
}
export default class KLAPI {
  private _config?: KLAPIConfig
  private readonly _loadConfig: () => Promise<KLAPIConfig>

  public constructor(loadConfig: () => Promise<KLAPIConfig>) {
    this._loadConfig = loadConfig
  }

  private async _getConfig(): Promise<KLAPIConfig> {
    return this._config || (this._config = await this._loadConfig())
  }

  private async get<T extends JsonObject | JsonArray>(
    path: string,
    params?: Record<string, string | number | undefined>
  ): KLAPIResult<T> {
    const cfg = await this._getConfig()
    const sp = new URLSearchParams(toURLParams(params))
    console.log(`KLAPI: ${path}?${sp}`)
    let json: T | undefined
    let status = 204
    let error
    try {
      const start = process.hrtime.bigint()
      const res = await fetch(`${cfg.KL_API_URL}/${path}?` + sp, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Kayttajatunnus': cfg.KL_API_UID,
          'X-Salasana': cfg.KL_API_PWD,
        },
      })
      status = res.status
      try {
        if (res.ok) {
          json = (await res.json()) as T
        } else {
          console.error('KLAPI: !res.ok', {
            headers: res.headers,
            status: res.status,
            statusText: res.statusText,
            body: res.body,
          })
        }
        if (json) {
          const time = Number((process.hrtime.bigint() - start) / 100000n) / 10
          console.log(`KLAPI response (in ${time}ms):` + JSON.stringify(json))
        } else {
          error = await res.text()
          console.error('KLAPI not ok', status, error)
        }
      } catch (jse) {
        console.error('KLAPI JSON expection', jse)
        console.log(status, JSON.stringify(res))
      }
    } catch (e: unknown) {
      console.error('KLAPI exception', e)
      if (e instanceof Error) {
        error = e.message
      }
    }

    console.log('KPLAPI.get returning', { status, error, json })
    return { status, error, json }
  }

  async lueKoiranPerustiedot(parametrit: KLKoiraParametrit): KLAPIResult<KLKoira> {
    if (!parametrit.Rekisterinumero && !parametrit.Tunnistusmerkintä) {
      return { status: 404 }
    }
    const result = await this.get<KLKoira>('Koira/Lue/Perustiedot', parametrit)
    if (!result.json?.rekisterinumero) {
      console.warn('KLAPI returned json without rekisterinumero, converting to 404')
      return { status: 404, error: 'not found' }
    }
    if (result.json?.kuollut) {
      console.warn('KLAPI returned json with kuollut -date, converting to 404')
      return { status: 404, error: 'diseased' }
    }
    return result
  }

  async lueKoiranKoetulokset(parametrit: KLKoetulosParametrit): KLAPIResult<Array<KLKoetulos>> {
    if (!parametrit.Rekisterinumero) {
      return { status: 404 }
    }
    return this.get('Koira/Lue/Koetulokset', parametrit)
  }

  async lueKoemuodot(parametrit: KLKoemuodotParametrit): KLAPIResult<Array<KLKoemuoto>> {
    return this.get('Koemuoto/Lue/Koemuodot', parametrit)
  }

  async lueKoetulokset(parametrit: KLKoemuotoParametrit): KLAPIResult<Array<KLKoemuodonTulos>> {
    return this.get('Koemuoto/Lue/Tulokset', parametrit)
  }

  async lueKoemuodonTarkenteet(parametrit: KLKoemuotoParametrit): KLAPIResult<Array<KLKoemuodonTarkenne>> {
    return this.get('Koemuoto/Lue/Tarkenteet', parametrit)
  }

  async lueKoemuodonYlituomarit(parametrit: KLKoemuotoParametrit): KLAPIResult<Array<KLKoeHenkilö>> {
    return this.get('Koemuoto/Lue/Ylituomarit', parametrit)
  }

  async lueKoemuodonKoetoimitsijat(parametrit: KLKoemuotoParametrit): KLAPIResult<Array<KLKoeHenkilö>> {
    return this.get('Koemuoto/Lue/Koetoimitsijat', parametrit)
  }

  async lueKoetapahtumat(parametrit: KLKoetapahtumaParametrit): KLAPIResult<Array<KLKoetapahtuma>> {
    return this.get('Koe/Lue/Koetapahtumat', parametrit)
  }

  async lueKennelpiirit(): KLAPIResult<Array<KLKennelpiiri>> {
    return this.get('Yleista/Lue/Kennelpiirit')
  }

  async luePaikkakunnat(parametrit: { KennelpiirinNumero?: number }): KLAPIResult<Array<KLPaikkakunta>> {
    return this.get('Yleista/Lue/Paikkakunnat', parametrit)
  }

  async lueYhdistykset(parametrit: KLYhdistysParametrit): KLAPIResult<Array<KLYhdistys>> {
    return this.get('Yleista/Lue/Yhdistykset', parametrit)
  }

  async lueParametrit(parametrit: KLParametritParametrit): KLAPIResult<Array<KLArvo>> {
    return this.get('Yleista/Lue/Parametrit', parametrit)
  }

  async lueRoturyhmät(parametrit: KLRoturyhmätParametrit): KLAPIResult<Array<KLRoturyhmä>> {
    return this.get('Yleista/Lue/Roturyhmat', parametrit)
  }

  async lueRodut(parametrit: KLRodutParametrit): KLAPIResult<Array<KLRotu>> {
    return this.get('Yleista/Lue/Rodut', parametrit)
  }
}
