import { isFinnishRegNo, isKcDomesticRegNo, isModernFinnishRegNo, regNoError, validateRegNo } from './validation'

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
    'VDH/DRC-B14-1002',
  ])('should return true for %p', (regNo) => {
    expect(validateRegNo(regNo)).toEqual(true)
  })

  it.each(['', 'A1', ' FI44076/17', 'FI44076/17 '])('should return false for %p', (regNo) => {
    expect(validateRegNo(regNo)).toEqual(false)
  })

  // Looking a dog up takes any spelling Kennelliitto may hold, the Estonian sections too (KOE-1651).
  it.each(['EST-12345/E20', 'EST-12345/U20', 'EST-12345/MA20', 'EST48412/20', 'DK 21568/2021', 'LSVK LR 1234/19'])(
    'lets %s be looked up',
    (regNo) => {
      expect(validateRegNo(regNo)).toEqual(true)
    }
  )
})

describe('regNoError', () => {
  const VALID_CASES = [
    'CLP/LR/ 36170',
    'DK04329/2016',
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
    'VDH/DRC-B14-1002',
    'NOCH12345/20',
    'SE12345/2024',
    'DK21568/2021',
    'NO12345/20',
    'EST-12345/20',
    'EST-12345/E20',
    'EST-12345/U20',
    'EST-12345/MA20',
    'LV-LBR-1234/19',
    'LV-LBR-12345/19',
    'LSVK LR 1234/19',
    'LSVK LRR 12345/19',
  ]

  it.each(VALID_CASES)('takes %s as typed', (regNo) => {
    expect(regNoError(regNo)).toBeUndefined()
  })

  it.each([
    ['DK 21568/2021', 'DK'],
    ['DK-21568/2021', 'DK'],
    ['DK21568/21', 'DK'],
    ['SE 12345/2024', 'SE'],
    ['SE1234/2024', 'SE'],
    ['NO12345/2020', 'NO'],
    ['EST48412/20', 'EST'],
    ['EST-12345/X20', 'EST'],
    ['LV LBR 1234/19', 'LV'],
    ['LVLBR1234/19', 'LV'],
    ['LSVK-LR-1234/19', 'LSVK'],
    ['LSVKLR1234/19', 'LSVK'],
    ['XX 12345/20', 'invalid'],
    ['XX.12345/20', 'invalid'],
    ['FI 12345/20', 'invalid'],
    ['FI.12345/20', 'invalid'],
    ['NHSB 3168346', 'invalid'],
    ['A1', 'invalid'],
    ['', 'invalid'],
  ])('refuses %s with the %s message', (regNo, error) => {
    expect(regNoError(regNo)).toEqual(error)
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

describe('isKcDomesticRegNo', () => {
  it.each([
    'FI59578/09',
    'fi12345/20',
    'FI 12345/20',
    'FIN45793/08',
    'ER12345/24',
    'EJ1234/20',
    'SF06626/92',
    ' FI-12345/20',
  ])('takes %p as Finnish', (regNo) => {
    expect(isKcDomesticRegNo(regNo)).toEqual(true)
  })

  it.each(['SE12345/2024', 'S12345/2010', 'NO12345/20', 'FIX12345/20', 'ERA123/20', 'KCB N 1234', ''])(
    'takes %p as foreign',
    (regNo) => {
      expect(isKcDomesticRegNo(regNo)).toEqual(false)
    }
  )
})
