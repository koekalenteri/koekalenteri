import { Replace } from "./JSON";

export type BreedCode = '110' | '111' | '121' | '122' | '263' | '312';

export type JsonDog = {
  regNo: string
  name?: string
  rfid?: string
  breedCode?: BreedCode
  dob?: string
  gender?: DogGender
  refreshDate?: string
  results?: JsonTestResult[]
  titles?: string
  sire?: DogName,
  dam?: DogName
}

export type Dog = Replace<Replace<JsonDog, 'dob' | 'refreshDate', Date | undefined>, 'results', TestResult[] | undefined>;

export type DogName = {
  name?: string,
  titles?: string
}

export type DogGender = 'F' | 'M'

export type JsonTestResult = {
  type: string
  class: string
  date: string
  location: string
  result: string
  judge: string
  points?: number
  rank?: number
  ext?: string
  notes?: string
  cert?: boolean
  resCert?: boolean
}

export type TestResult = Replace<JsonTestResult, 'date', Date>
