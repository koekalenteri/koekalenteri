import type { JsonObject } from '../../types'

/**
 * Types for Kennelliitto's Integraatio API (KLIntegraatio.ts).
 *
 * Response types follow real Testi2 responses read on 15.10.2026, not the API document's tables.
 * Where no real sample exists the type says so: the request bodies of the
 * three write calls, which follow the API document and are exercised with mocked fetch only.
 */

export type KLIntegraatioConfig = {
  KL_API_PWD: string
  KL_API_UID: string
  /** Base address of the API, per stack, e.g. https://rajapinta.kennelliitto.fi/KennelliittoAPI_JulkinenTesti2/ */
  KL_INT_API_URL: string
  /** Token endpoint, per stack. */
  KL_INT_SSO_URL: string
}

/** The fields of the token response the client reads. */
export type KLIntegraatioToken = {
  access_token: string
  /** Seconds. Testi2 answered both 1799 and 3600, so it is never hardcoded. */
  expires_in: number
  token_type: string
}

export type KLIntegraatioResult<T> = {
  /** Set when the call failed without a usable body (network error, unreadable body). */
  error?: string
  json?: T
  status: number
  /** The reasons KL gave for a 400 or 404, also logged. */
  virheet?: string[]
}

export type KLIntKoemuodonTulos = {
  hylätty: boolean
  järjestys: number
  keskeytys: boolean
  pisteetMax: number
  pisteetMin: number
  /** The result string as KL spells it, e.g. ALO1, VOI-, sert, vara sert. */
  tulos: string
  tulostyypinNimi: string
  tulostyyppi: number
}

export type KLIntKoemuodonTapahtuma = {
  tapahtumanNimi: string
  tapahtumantyyppi: number
  tapahtumantyyppiNimi: string
}

export type KLIntKoemuoto = {
  koemuoto: string
  luokat: string[]
  nimi: string
  /**
   * Always empty in the real NOWT, NOME-A, NOME-B, NOU and NKM responses, so the element type is
   * not known.
   */
  osaAlueet: JsonObject[]
  /** Always empty in the real responses, like osaAlueet. */
  osaAlueValinnat: JsonObject[]
  tapahtumat: KLIntKoemuodonTapahtuma[]
  tarkenteet: string[]
  tulokset: KLIntKoemuodonTulos[]
}

export type KLIntKoemuotoParametrit = {
  koemuoto: string
}

/** One trial in the Koe/Kokeet list. Note `tilanNimi`, where Koe/Lue says `tilaNimi`. */
export type KLIntKoeListassa = {
  alku: string
  /** null for trials that KL has not given a GUID, which is most of the old ones. */
  koeGUID: string | null
  koeTunnus: string
  koemuoto: string
  kokokaudenkoe: boolean
  kennelpiiri: number
  loppu: string
  paikkakunta: string
  tapahtuma: string
  tarkenne: string
  tila: number
  tilanNimi: string
  tyyppi: string
  yhdistysNimi: string
  yhdistysNumero: number
  ylituomariNimi: string
  ylituomariNumero: number
}

export type KLIntKokeetParametrit = {
  /** yyyy-MM-dd */
  alku: string
  /** yyyy-MM-dd */
  loppu: string
  koemuoto: string
}

export type KLIntRajoitus = {
  lisätieto: string
  rajoitus: number
  rajoitusNimi: string
}

export type KLIntHenkilö = {
  jäsennumero: number | null
  nimi: string
  puhelin: string
  sähköposti: string
  tehtävä: string
}

/** The Koe/Lue answer. Note `tilaNimi` and `tapahtumatyyppi`, which Koe/Kokeet spells differently. */
export type KLIntKoe = {
  alku: string
  henkilöstö: KLIntHenkilö[]
  ilmoittautuminen_Alku: string
  ilmoittautuminen_Linkki: string
  ilmoittautuminen_Lisätiedot: string
  ilmoittautuminen_Loppu: string
  julkisetLisätiedot: string
  kennelpiiri: number
  koeGUID: string | null
  koeTunnus: string
  koemuoto: string
  /** The real samples had empty lists, so the element types are assumed to be strings like in Koemuoto. */
  luokat: string[]
  loppu: string
  osallistumismaksu: number
  paikka: string
  paikkakunta: string
  rajoitukset: KLIntRajoitus[]
  tapahtumatyyppi: number
  tapahtumatyyppiNimi: string
  tarkenteet: string[]
  tila: number
  tilaNimi: string
  tilinumero: string
  verkkosivut: string
  viitenumero: string
  yhdistys: number
  yhdistysNimi: string
  ylituomari: number
  ylituomariNimi: string
}

/** Koe/Lue takes one of the two. */
export type KLIntKoeLueParametrit =
  | { koeGuid: string; koeTunnus?: undefined }
  | { koeGuid?: undefined; koeTunnus: string }

/** Koira takes exactly one of the four (KL answers 400 otherwise). */
export type KLIntKoiraParametrit =
  | { rekisterinumero: string }
  | { tunnistusmerkinta: string }
  | { nimi: string }
  | { id: number }

/**
 * The Koira answer, from real Testi2 responses (15.10.2026). A dog KL does not find, and a dead
 * one, comes back as 200 with every string empty and every other field null, so check
 * `rekisterinumero` before trusting it (KLIntegraatio.lueKoira does). An unknown birth date can be
 * `0001-01-01T00:00:00`.
 */
export type KLIntKoira = {
  id_Emä: number | null
  id_Isä: number | null
  id_Sukupuoli: number | null
  nimi: string
  rekisterinumero: string
  rotu: string
  rotukoodi: string
  sukupuoli: string
  /** yyyy-MM-ddT00:00:00 */
  syntymäaika: string | null
  tittelit: string
  tunnistusmerkintä: string
  väri: string
}

/** Request body of Koe/Tulos/Tallenna, from the API document (no real sample). */
export type KLIntTulosTallenna = {
  hylätty: boolean
  keskeytetty: boolean
  koeGUID: string
  lisätiedot?: string
  nimi: string
  palkintotuomarit: number[]
  pisteet?: number
  päivä: string
  rekisterinumero: string
  sijoitus?: number
  tarkenne?: string
  tulos: string
  tuomarit: number[]
}

export type KLIntTulosTallennaVastaus = {
  TulosId: number
}

/** Request body of Koe/Tulos/Poista, from the API document (no real sample). */
export type KLIntTulosPoista = {
  koeGUID: string
  päivä: string
  rekisterinumero: string
}

/** Koe/AsetaTila 1253 hands the trial to the chief judge for approval. */
export const KL_TILA_YLITUOMARIN_HYVÄKSYTTÄVÄKSI = 1253

/** Request body of Koe/AsetaTila, from the API document (no real sample). */
export type KLIntAsetaTila = {
  koeGUID: string
  tila: number
}
