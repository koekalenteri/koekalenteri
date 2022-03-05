export type Dog = {
  regNo: string
  name: string
  rfid: string
  breedCode: string
  dob: Date | string
  gender?: DogGender
  refreshDate?: Date | string
  results?: TestResult[]
  titles?: string
}

export type DogGender = 'F' | 'M'

export type TestResult = {
  type: string
  class: string
  date: Date | string
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
