import { capitalize, reverseName, splitName } from './string'

describe('string', () => {
  describe('splitName', () => {
    it('splits properly', () => {
      expect(splitName()).toEqual({ firstName: '', lastName: '' })
      expect(splitName('')).toEqual({ firstName: '', lastName: '' })
      expect(splitName('Matti Meikäläinen')).toEqual({ firstName: 'Matti', lastName: 'Meikäläinen' })
      expect(splitName('Elli-Noora Alexandra Kamilla Jurvanen')).toEqual({
        firstName: 'Elli-Noora',
        lastName: 'Jurvanen',
      })
    })
  })

  describe('capitalize', () => {
    it('calitalizes properly', () => {
      expect(capitalize()).toEqual('')
      expect(capitalize('')).toEqual('')
      expect(capitalize('matti meikäläinen')).toEqual('Matti Meikäläinen')
      expect(capitalize('äijä örvelö')).toEqual('Äijä Örvelö')
      expect(capitalize('elli-noora alexandra kamilla jurvanen')).toEqual('Elli-Noora Alexandra Kamilla Jurvanen')
      expect(capitalize('TEST PERSON')).toEqual('Test Person')
      expect(capitalize('test person-dash')).toEqual('Test Person-Dash')
    })
  })

  describe('reverseName', () => {
    it('reverses properly', () => {
      expect(reverseName()).toEqual('')
      expect(reverseName('')).toEqual('')
      expect(reverseName('Meikäläinen Matti')).toEqual('Matti Meikäläinen')
      expect(reverseName('Puna-Kuono Petteri')).toEqual('Petteri Puna-Kuono')
      expect(reverseName('Jurvanen Elli-Noora Alexandra Kamilla')).toEqual('Elli-Noora Jurvanen')
    })
  })
})
