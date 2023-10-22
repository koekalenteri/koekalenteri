import type { Judge } from '../../types'

const mockJudges: Judge[] = [
  {
    active: true,
    district: 'Uusimaa',
    email: 'tuomari1@sposti.not',
    eventTypes: [],
    id: 123,
    languages: [],
    location: 'Helsinki',
    name: 'Tuomari 1',
    phone: '123456789',
  },
  {
    active: true,
    district: 'Tampere',
    email: 'tuomari2@sposti.not',
    eventTypes: [],
    id: 223,
    languages: [],
    location: 'Tampere',
    name: 'Tuomari 2',
    phone: '123456788',
  },
  {
    active: true,
    district: 'Turku',
    email: 'tuomari3@sposti.not',
    eventTypes: [],
    id: 323,
    languages: [],
    location: 'Turku',
    name: 'Tuomari 3',
    phone: '123456787',
  },
]

export async function getJudges(signal?: AbortSignal) {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockJudges))
  })
}

export async function putJudge(judge: Judge, token?: string, signal?: AbortSignal): Promise<Judge> {
  throw new Error('not implemented')
}
