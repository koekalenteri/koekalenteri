import type { KcDogReport } from '@/lib/kennelliittoResults'
import i18next from 'i18next'
import fi from '@/i18n/locales/fi/translation.json'
import { finnishDay } from '@/lib/kennelliittoResults'
import { parseJSON } from '@/lib/utils'
import { dogLine, skippedLine } from './kennelliittoMessages'

const finnish = i18next.createInstance()
beforeAll(() =>
  finnish.init({ interpolation: { escapeValue: false }, lng: 'fi', resources: { fi: { translation: fi } } })
)

/** What the page makes of an answer: the body goes through the client's own reviver, which turns date-shaped strings into Dates. */
const received = (dog: KcDogReport): KcDogReport => parseJSON(JSON.stringify(dog), true)

describe('the messages of a sending', () => {
  it('names the day of a dog whose day has not begun as a person reads it, after the answer has been revived', () => {
    const dog = received({
      id: 'a',
      name: 'Hukka',
      problems: [{ code: 'dayNotReached', detail: finnishDay('2026-10-17') }],
      regNo: 'FI1/20',
      status: 'blocked',
    })

    const { text } = dogLine(finnish.t, dog)

    expect(text).toContain('17.10.2026')
    expect(text).not.toContain('GMT')
  })

  it('names the day a result was sent for in the same way, in the dogs a hand-over lists', () => {
    const dog = received({
      id: 'b',
      name: 'Rölli',
      problems: [{ code: 'dayChanged', detail: finnishDay('2026-01-05') }],
      regNo: 'FI2/20',
      status: 'blocked',
    })

    expect(dogLine(finnish.t, dog).text).toContain('5.1.2026')
  })

  it('would have shown a bare yyyy-MM-dd day as a Date: the reason the days are named d.M.yyyy', () => {
    const dog = received({
      id: 'c',
      name: 'Peni',
      problems: [{ code: 'dayNotReached', detail: '2026-10-17' }],
      regNo: 'FI4/20',
      status: 'blocked',
    })

    expect(dogLine(finnish.t, dog).text).toContain('GMT')
  })

  it('says a skipped dog by its state when it has no problem to name', () => {
    const line = skippedLine(finnish.t, {
      dogStatus: 'notRecorded',
      id: 'c',
      name: 'Musti',
      outcome: 'skipped',
      regNo: 'FI3/20',
    })

    expect(line.text).toEqual('Musti (FI3/20): Ei tulosta')
  })

  it('says a skipped dog that is not on the trial by its id', () => {
    const line = skippedLine(finnish.t, {
      dogStatus: 'notRecorded',
      id: 'gone',
      name: '',
      outcome: 'skipped',
      regNo: '',
    })

    expect(line.text).toEqual('gone: Ei tulosta')
  })
})
