import type { KcDogReport } from '@/lib/kennelliittoResults'
import i18next from 'i18next'
import fi from '@/i18n/locales/fi/translation.json'
import { finnishDay } from '@/lib/kennelliittoResults'
import { parseJSON } from '@/lib/utils'
import { dogLine, failedLine, skippedLine } from './kennelliittoMessages'

const finnish = i18next.createInstance()
beforeAll(() =>
  finnish.init({ interpolation: { escapeValue: false }, lng: 'fi', resources: { fi: { translation: fi } } })
)

/** What the page makes of an answer: the body as JSON, parsed as written. */
const received = (dog: KcDogReport): KcDogReport => parseJSON(JSON.stringify(dog))

describe('the messages of a sending', () => {
  it('names the day of a dog whose day has not begun as a person reads it', () => {
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

  it('shows a bare yyyy-MM-dd day in a message as the text it is (KOE-1546)', () => {
    const dog = received({
      id: 'c',
      name: 'Peni',
      problems: [{ code: 'dayNotReached', detail: '2026-10-17' }],
      regNo: 'FI4/20',
      status: 'blocked',
    })

    expect(dogLine(finnish.t, dog).text).toContain('2026-10-17')
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

  it.each([
    [
      'with Kennelliitto’s own words',
      { errors: ['Koiran nimi ei täsmää.'], status: 400 },
      'Hukka (FI1/20): Koiran nimi ei täsmää.',
    ],
    [
      'by the status of a refusal without reasons',
      { status: 500 },
      'Hukka (FI1/20): Kennelliitto ei vastannut selvästi (tila 500). Yritä uudelleen.',
    ],
    [
      'as not stored here when Kennelliitto’s answer could not be recorded (KOE-1140)',
      { notRecorded: true as const },
      'Hukka (FI1/20): Kennelliiton vastausta ei saatu tallennettua Koekalenteriin. Lähetä koira uudelleen.',
    ],
  ])('says a failed dog %s', (_case, fields, text) => {
    const line = failedLine(finnish.t, { id: 'a', name: 'Hukka', outcome: 'failed', regNo: 'FI1/20', ...fields })

    expect(line).toEqual({ id: 'a', text })
  })
})
