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
  syntymäaika: string
  sukupuoli: string
  rotukoodi: string
  rotunimi: string
  väri: string
}

export type Dog = {
  regNo: string
  name: string
  rfid: string
  breedCode: string
  dob: Date | string
  gender?: DogGender
  refreshDate?: Date | string
}

export type DogGender = 'F' | 'M'
