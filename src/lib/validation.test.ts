import type { Person } from '../types'

import { isFinnishRegNo, isModernFinnishRegNo, validatePerson, validateRegNo } from './validation'

const testPerson: Person = {
  name: 'Matti Meikäläinen',
  email: 'email@domain.com',
  phone: '0401234567',
  location: 'Helsinki',
}

describe('validRegNo', () => {
  it.each([
    'CLP/LR/ 36170',
    'DK04329/2016',
    'DK18979/2018',
    'DRC -L 1822362',
    'DRC-L 1620751',
    'FI44076/17',
    'ER12345/24',
    'KCAS 03997505',
    'KCAU1583901',
    'KCREG AW01372609',
    'LO1752937',
    'LOE 2442557',
    'LOF 266115/28299',
    'LOF259519/34993',
    'MET .LABR.968/17',
    'NHSB3168346',
    'ÖHZB LR 12568',
    'SE39992/2017',
    'SHSB 742304',
    'S11405/2007',
  ])('should return true for %p', (regNo) => {
    expect(validateRegNo(regNo)).toEqual(true)
  })

  it.each(['', 'A1', ' FI44076/17', 'FI44076/17 '])('should return false for %p', (regNo) => {
    expect(validateRegNo(regNo)).toEqual(false)
  })
})

describe('isFinnishRegNo', () => {
  it.each([
    'CLP/LR/ 36170',
    'DK04329/2016',
    'DK18979/2018',
    'DRC -L 1822362',
    'DRC-L 1620751',
    'KCAS 03997505',
    'KCAU1583901',
    'KCREG AW01372609',
    'LO1752937',
    'LOE 2442557',
    'LOF 266115/28299',
    'LOF259519/34993',
    'MET .LABR.968/17',
    'NHSB3168346',
    'ÖHZB LR 12568',
    'SE39992/2017',
    'SHSB 742304',
    'S11405/2007',
  ])('should return false for %p', (regNo) => {
    expect(isFinnishRegNo(regNo)).toEqual(false)
  })

  it.each([
    'SF00028/1899',
    'SF00107/12',
    'SF03072/23',
    'SF08750/31',
    'SF04962/42',
    'SF00072/50',
    'SF07328/62',
    'SF128604/76',
    'SF20554P/79',
    'SF00291U/80',

    'SF29182U/85',
    'SF29183V/85',
    'SF29184X/85',
    'SF291850/85',
    'SF291861/85',
    'SF291872/85',
    'SF291883/85',
    'SF291894/85',

    'SF07908L/85',
    'SF20150/89',
    'SF30121/94',
    'FIN25483/95',
    'FIN31871/98',
    'FIN11170/01',
    'FIN45793/08',
    'FI59578/09',
    'FI44076/17',
    'ER12345/24',
  ])('should return true for %p', (regNo) => {
    expect(isFinnishRegNo(regNo)).toEqual(true)
  })
})

describe('isModernFinnishRegNo', () => {
  it.each(['FI59578/09', 'FI44076/17', 'ER12345/24'])('should return true for %p', (regNo) => {
    expect(isModernFinnishRegNo(regNo)).toEqual(true)
  })

  it.each(['SF00028/1899', 'SF00107/12', 'SF00291U/80', 'SF30121/94', 'FIN45793/08'])(
    'should return false for %p',
    (regNo) => {
      expect(isModernFinnishRegNo(regNo)).toEqual(false)
    }
  )
})

describe('validatePerson', () => {
  it('should require name', () => {
    expect(validatePerson({ ...testPerson, name: '' })).toEqual('required')
  })

  it('should require and validate email', () => {
    expect(validatePerson({ ...testPerson, email: '' })).toEqual('required')
    expect(validatePerson({ ...testPerson, email: '-@a' })).toEqual('email')
  })

  it('should require phone', () => {
    expect(validatePerson({ ...testPerson, phone: '' })).toEqual('required')
  })

  it('should require locaton', () => {
    expect(validatePerson({ ...testPerson, location: '' })).toEqual('required')
  })
})
