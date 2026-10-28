import type { KcDogReport } from '@/lib/kennelliittoResults'
import i18next from 'i18next'
import fi from '@/i18n/locales/fi/translation.json'
import { finnishDay } from '@/lib/kennelliittoResults'
import { parseJSON } from '@/lib/utils'
import { createsDogLine, dogLine, dogNotAddedText, failedLine, skippedLine } from './kennelliittoMessages'

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

  it('says why a dog Kennelliitto knows by another number waits, in the dogs a hand-over lists (KOE-1653)', () => {
    const dog = received({
      id: 'k',
      kcDog: { foundBy: 'microchip', name: 'FILURIN PARADOX', regNo: 'FI25555/20', rfid: '981098106889342' },
      name: 'FILURIN PARADOX',
      problems: [],
      regNo: 'SE22358/2021',
      status: 'ready',
    })

    expect(dogLine(finnish.t, dog).text).toEqual(
      'FILURIN PARADOX (SE22358/2021): Kennelliitto tuntee koiran numerolla FI25555/20: valitse lähetyksessä, mitä tehdään'
    )
  })

  it.each([
    [{ code: 'kcRegNoDiffers', detail: 'FI25555/20' }, 'Kennelliitto tuntee koiran numerolla FI25555/20.'],
    [{ code: 'kcRegNoTaken', detail: 'FI25555/20' }, 'Numero FI25555/20 on jo toisella ilmoittautumisella'],
    [{ code: 'kcRegNoNotChanged' }, 'Rekisterinumeroa ei saatu vaihdettua'],
  ] as const)('says why a dog with another number in Kennelliitto was not sent: %j', (problem, text) => {
    const line = skippedLine(finnish.t, {
      dogStatus: 'ready',
      id: 'k',
      name: 'FILURIN PARADOX',
      outcome: 'skipped',
      problems: [problem],
      regNo: 'SE22358/2021',
    })

    expect(line.text).toContain(text)
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

  it('says a skipped dog without a state as one without a result', () => {
    const line = skippedLine(finnish.t, { id: 'c', name: 'Musti', outcome: 'skipped', regNo: 'FI3/20' })

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
      'with Kennelliitto’s own words when its refusal could not be stored either (KOE-1140)',
      { answerNotStored: true as const, errors: ['Koiran nimi ei täsmää.'], status: 400 },
      'Hukka (FI1/20): Koiran nimi ei täsmää.',
    ],
    [
      'by the status when Kennelliitto gave no usable answer, stored here or not (KOE-1140)',
      { answerNotStored: true as const, status: 503 },
      'Hukka (FI1/20): Kennelliitto ei vastannut selvästi (tila 503). Yritä uudelleen.',
    ],
    [
      'as not stored here when Kennelliitto accepted it and its answer could not be stored (KOE-1140)',
      { answerNotStored: true as const },
      'Hukka (FI1/20): Kennelliiton vastausta ei saatu tallennettua Koekalenteriin. Lähetä koira uudelleen.',
    ],
    [
      'as a dog Kennelliitto did not add, with its reasons (KOE-1201)',
      { dogNotAdded: true as const, errors: ['Ei käyttöoikeutta.'], status: 403 },
      'Hukka (FI1/20): Koiran FI1/20 lisääminen Jalostustietojärjestelmään ei onnistunut. Tarkista tiedot. Ei käyttöoikeutta.',
    ],
    [
      'as a dog Kennelliitto did not add, with the status when it gave no reasons (KOE-1201)',
      { dogNotAdded: true as const, status: 500 },
      'Hukka (FI1/20): Koiran FI1/20 lisääminen Jalostustietojärjestelmään ei onnistunut. Tarkista tiedot. Kennelliitto ei vastannut selvästi (tila 500). Yritä uudelleen.',
    ],
    [
      'as a dog Kennelliitto did not add, even when its answer could not be stored here (KOE-1201)',
      { answerNotStored: true as const, dogNotAdded: true as const, status: 0 },
      'Hukka (FI1/20): Koiran FI1/20 lisääminen Jalostustietojärjestelmään ei onnistunut. Tarkista tiedot. Kennelliitto ei vastannut selvästi (tila 0). Yritä uudelleen.',
    ],
    [
      'as an unclear answer when the report says nothing more',
      {},
      'Hukka (FI1/20): Kennelliitto ei vastannut selvästi (tila 0). Yritä uudelleen.',
    ],
  ])('says a failed dog %s', (_case, fields, text) => {
    const line = failedLine(finnish.t, { id: 'a', name: 'Hukka', outcome: 'failed', regNo: 'FI1/20', ...fields })

    expect(line).toEqual({ id: 'a', text })
  })

  it('names the country a dog is added to Kennelliitto as (KOE-1201)', () => {
    const dog = received({
      createsDog: { code: 'SE', name: 'Ruotsi' },
      id: 'a',
      name: 'Hukka',
      problems: [],
      regNo: 'SE12345/2024',
      status: 'ready',
    })

    expect(createsDogLine(dog)).toEqual({ id: 'a', text: 'Hukka (SE12345/2024): Ruotsi' })
  })

  it.each([
    [
      'with the reasons stored',
      { errors: ['Rotukoodi ei kelpaa.'] },
      'Koiran SE1/20 lisääminen Jalostustietojärjestelmään ei onnistunut. Tarkista tiedot. Rotukoodi ei kelpaa.',
    ],
    [
      'alone when no reasons were stored (an answer without them)',
      {},
      'Koiran SE1/20 lisääminen Jalostustietojärjestelmään ei onnistunut. Tarkista tiedot.',
    ],
  ])('says a dog was not added %s', (_case, fields, text) => {
    expect(dogNotAddedText(finnish.t, { regNo: 'SE1/20', ...fields })).toEqual(text)
  })
})
