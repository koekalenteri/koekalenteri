export type KLAPIConfig = {
  KL_API_URL: string
  KL_API_UID: string
  KL_API_PWD: string
}

export type KLDog = {
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

export type KLTestResult = {
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

export type KLTestResults = Array<KLTestResult>

export type KLKoemuoto = {
  lyhenne: string
  koemuoto: string
}
