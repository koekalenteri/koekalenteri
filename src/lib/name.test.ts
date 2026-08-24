import { validName } from './name'

describe('validName', () => {
  it.each(['Matti Meikäläinen', 'Öja Ojanperä', 'Ja-Nette Virtanen', "Ja'far Al-Rashid", 'Meikäläinen, Matti'])(
    'accepts %s',
    (name) => {
      expect(validName(name)).toBe(true)
    }
  )

  it.each([
    'Matti ja Maija Meikäläinen',
    'Matti JA Maija',
    'Matti & Maija',
    'Matti / Maija',
    'ja Maija',
    'Matti Meikäläinen ja',
  ])('rejects %s', (name) => {
    expect(validName(name)).toBe(false)
  })
})
