export interface JsonDog extends DogName {
  regNo: string
  callingName?: string
  rfid?: string
  rfidEditable?: boolean
  kcId?: number
  breedCode?: BreedCode
  dob?: string
  gender?: DogGender
  refreshDate?: string
  results?: JsonTestResult[]
  sire?: DogName
  dam?: DogName
}

export interface Dog extends Omit<JsonDog, 'dob' | 'refreshDate' | 'results'> {
  dob?: Date
  refreshDate?: Date
  results: TestResult[]
}

interface DogName {
  name?: string
  titles?: string
}

export type DogGender = 'F' | 'M'

export interface JsonTestResult {
  type: string
  class: string
  date: string
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
  date: Date
}

// export type RetrieverBreedCode = '110' | '111' | '121' | '122' | '263' | '312'

/**
 * The Kennelliitto breed codes, as the breed list (`src/i18n/locales/fi/breed.json`) knows them:
 * the list is the data, and this is its keys, so a breed added to the list is a valid code at once
 * and nothing keeps a second copy of four hundred codes (KOE-1347).
 */
export type BreedCode = Exclude<keyof typeof import('../i18n/locales/fi/breed.json'), 'default'>
