export type KLAPIConfig = {
  KL_API_URL: string
  KL_API_UID: string
  KL_API_PWD: string
}

export type KLAPIResult<T> = Promise<{
  status: number
  error?: string
  json?: T
}>

export enum KLKieli {
  Suomi = 1,
  Ruotsi,
  Englanti
}

export type KLKoiraParametrit = {
  Rekisterinumero?: string,
  Tunnistusmerkintä?: string,
  Kieli: KLKieli
}

export type KLKoira = {
  /**
   * Koiran yksilöivä ID
   */
  id: number
  /**
   * Voimassa oleva rekisterinumero
   */
  rekisterinumero: string
  /**
   * Viimeisin koiralle kirjattu tunnistusmerkintä
   */
  tunnistusmerkintä: string
  nimi: string
  tittelit: string
  syntymäaika: string
  sukupuoli: string
  rotukoodi: string
  rotunimi: string
  väri: string
}

export type KLKoemuotoParametrit = {
  Koemuoto: string,
  Kennelpiiri?: number,
  Kieli: KLKieli
}

export type KLKoemuodotParametrit = {
  Rotukoodi?: string,
  Kieli: KLKieli
}

export type KLKoemuoto = {
  lyhenne: string
  koemuoto: string
}

export type KLKoemuodonTulos = {
  luokka: string,
  tulos: string,
  tyyppi: string
}

export type KLKoemuodonTarkenne = {
  tarkenne: string
}

export type KLKoetulosParametrit = {
  Rekisterinumero: string,
  Koemuoto?: string,
  Kieli: KLKieli
}

export type KLKoetulos = {
  koemuoto: string
  aika: string
  paikkakunta: string
  tapahtumanTyyppi: string
  luokka: string
  tulos: string
  lisämerkinnät: string
  tarkenne: string
  pisteet: number
  sijoitus:	number
  tuomari: string
}

export type KLKoeHenkilö = {
  jäsennumero: number
  nimi: string
  paikkakunta: string
  kennelpiiri: string
  puhelin: string
  sähköposti: string
  koemuodot: Array<{lyhenne: string, koemuoto: string}>
}

export type KLKoetapahtumaParametrit = {
  Alku: string //Date
  Loppu: string //Date
  Kennelpiiri?: number
  Paikkakunta?: string
  Yhdistys?: number
  Koemuoto?: string
  EiAGI?: '1'
  Kokokaudenkokeet?: '0' | '1'
  Kieli: KLKieli
}

export type KLKoetapahtuma = {
  id: number
  yhdistys: string
  lyhenne: string
  koemuoto: string
  tarkenne: string
  tapahtuma: string
  luokat: Array<string>
  aika: string //Date
  päättyy: string //Date
  tyyppi: string
  kennelpiiri: string
  paikkakunta: string
  paikka: string
  ylituomari: string
  koetoimitsija: string
  ilmoittautumiset: string
  rajoitukset: Array<{ tyyppi: string, lisätieto: string }>
  osanottomaksu: string
  tininumero: string
  viitenumero: string
  lisatiedot: string
  ilmoittautumisenAlku: string //Date
  ilmoittautumisenLoppu: string //Date
  www: string
  ilmoitauttumisLinkki: string
}

export type KLKennelpiiri = {
  numero: number
  kennelpiiri: string
}

export type KLPaikkakunta = {
  numero: number
  kennelpiiri: string
  paikkakunta: string
}

export type KLYhdistys = {
  jäsennumero: number
  yhdistys: string
}

export enum KLYhdistysRajaus {
  Koejärjestätä = 1,
  Näyttelyjärjestäjä
}

export type KLYhdistysParametrit = {
  Rajaus: KLYhdistysRajaus
  KennelpiirinNumero: number
}

export enum KLParametri {
  TapahtumienTyypit = 52
}

export type KLParametritParametrit = {
  Parametri: KLParametri
  Kieli: KLKieli
}

export type KLArvo = {
  id: number
  valinta: string
}

export type KLRoturyhmätParametrit = {
  Kieli: KLKieli
}

export type KLRoturyhmä = {
  numero: number
  tunnus: string
  roturyhmä: string
}

export enum KLRotuRajaus {
  Kaikki = 0,
  Päärodut
}

export type KLRodutParametrit = {
  Ryhmä?: number
  Rajaus: KLRotuRajaus
  Kieli: KLKieli
}

export type KLRotu = {
  roturyhmä: number
  rotukoodi: string
  rotu: string
}
