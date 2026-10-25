import type { DayKey } from './Day'

export interface JsonDog extends DogName {
  regNo: string
  callingName?: string
  rfid?: string
  rfidEditable?: boolean
  kcId?: number
  breedCode?: BreedCode
  /** The birth day; none for Kennelliitto's empty date. Rows stored before KOE-1547 were migrated to keys. */
  dob?: DayKey
  gender?: DogGender
  refreshDate?: string
  results?: JsonTestResult[]
  sire?: DogName
  dam?: DogName
}

export interface Dog extends Omit<JsonDog, 'refreshDate' | 'results'> {
  refreshDate?: Date
  results: TestResult[]
}

export interface DogName {
  name?: string
  titles?: string
}

/**
 * The dog as the published start list carries it: what the page shows of it, and nothing more
 * (KOE-1489). The list is anyone's to read, so the microchip, the Kennelliitto id, the calling name
 * and the results stay on the server, and a parent is only its name and titles.
 */
export interface JsonPublicDog extends DogName {
  regNo: string
  breedCode?: BreedCode
  dob?: DayKey
  gender?: DogGender
  sire?: DogName
  dam?: DogName
}

export type PublicDog = JsonPublicDog

export type DogGender = 'F' | 'M'

export interface JsonTestResult {
  type: string
  class: string
  /**
   * The day of the result, or '' for none (Kennelliitto's empty date), which every reader takes as no
   * day. Rows stored before KOE-1547 were migrated to keys.
   */
  date: DayKey | ''
  location: string
  result: string
  judge: string
  subType?: string
  points?: number
  rank?: number
  ext?: string
  notes?: string
  cert?: boolean
  resCert?: boolean
  cacit?: boolean
  resCacit?: boolean
}

export interface TestResult extends Omit<JsonTestResult, 'date'> {
  /** The day of the result; none for a hand-entered one not yet given a day, or a stored date with no day. */
  date?: DayKey
}

// export type RetrieverBreedCode = '110' | '111' | '121' | '122' | '263' | '312'

/**
 * The Kennelliitto breed codes, as the breed list (`src/i18n/locales/fi/breed.json`) knows them:
 * the list is the data, and this is its keys, so a breed added to the list is a valid code at once
 * and nothing keeps a second copy of four hundred codes (KOE-1347).
 */
export type BreedCode = Exclude<keyof typeof import('../i18n/locales/fi/breed.json'), 'default'>
