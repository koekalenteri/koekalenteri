import {capitalize, reverseName} from '../../../src/utils/string'

test('capitalize', function() {
  expect(capitalize('')).toEqual('')
  expect(capitalize('matti meikäläinen')).toEqual('Matti Meikäläinen')
  expect(capitalize('äijä örvelö')).toEqual('Äijä Örvelö')
  expect(capitalize('elli-noora alexandra kamilla jurvanen')).toEqual('Elli-Noora Alexandra Kamilla Jurvanen')
})

test('reverseName', function(){
  expect(reverseName('')).toEqual('')
  expect(reverseName('Meikäläinen Matti')).toEqual('Matti Meikäläinen')
  expect(reverseName('Puna-Kuono Petteri')).toEqual('Petteri Puna-Kuono')
  expect(reverseName('Jurvanen Elli-Noora Alexandra Kamilla')).toEqual('Elli-Noora Jurvanen')
})
