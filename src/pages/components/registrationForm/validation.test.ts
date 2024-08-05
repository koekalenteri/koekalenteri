import type { BreedCode, Person } from '../../../types'

import {
  filterRelevantResults,
  isFinnishRegNo,
  isModernFinnishRegNo,
  validateDog,
  validatePerson,
  validateRegNo,
} from './validation'

const testDog = {
  regNo: 'test-123',
  rfid: 'test-id',
  name: 'Test Dog',
  dob: new Date('2018-03-28'),
  results: [],
  sire: { titles: '', name: 'Sire' },
  dam: { titles: '', name: 'Dam' },
}

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

describe('validateDog', () => {
  it('should validate registration number', function () {
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') }
    expect(validateDog(testEvent, { dog: testDog })).toEqual(false)
    expect(validateDog(testEvent, { dog: { ...testDog, regNo: '' } })).toEqual('required')
  })

  it('should validate identification number', function () {
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') }
    expect(validateDog(testEvent, { dog: testDog })).toEqual(false)
    expect(validateDog(testEvent, { dog: { ...testDog, rfid: '' } })).toEqual('required')
  })

  it('should validate name', function () {
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') }
    expect(validateDog(testEvent, { dog: testDog })).toEqual(false)
    expect(validateDog(testEvent, { dog: { ...testDog, name: '' } })).toEqual('required')
  })

  it.each<BreedCode>(['110', '111', '121', '122', '263', '312'])('should allow breed %p for NOU event', (breedCode) => {
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') }
    expect(validateDog(testEvent, { dog: { ...testDog, breedCode } })).toEqual(false)
  })

  it.each<BreedCode>(['1', '13', '148.1P'])('should not allow breed %p for NOU event', (breedCode) => {
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') }
    expect(validateDog(testEvent, { dog: { ...testDog, breedCode } })).toEqual({
      key: 'dogBreed',
      opts: { field: 'dog', type: breedCode.replace('.', '-') },
    })
  })

  it.each([
    ['2021-01-01', { key: 'dogAge', opts: { field: 'dog', length: 9 } }],
    ['2020-01-16', { key: 'dogAge', opts: { field: 'dog', length: 9 } }],
    ['2020-01-15', false],
    ['2010-01-01', false],
  ])('when event is at 2020-10-50 and dog dob is %p, should return %p', (dob, result) => {
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') }
    expect(validateDog(testEvent, { dog: { ...testDog, dob: new Date(dob) } })).toEqual(result)
  })

  it.each([
    [{ key: 'dogSM', opts: { field: 'dog' } }, 'NOME-B SM', 'KCSB4027CU'],
    [{ key: 'dogSM', opts: { field: 'dog' } }, 'NOME-A SM', 'KCSB4027CU'],
    [{ key: 'dogSM', opts: { field: 'dog' } }, 'NOWT SM', 'KCSB4027CU'],
    [{ key: 'dogSM', opts: { field: 'dog' } }, 'NOME-B SM', 'SE39992/2017'],
    [{ key: 'dogSM', opts: { field: 'dog' } }, 'NOME-A SM', 'SE39992/2017'],
    [{ key: 'dogSM', opts: { field: 'dog' } }, 'NOWT SM', 'SE39992/2017'],
    [false, 'NOME-B SM', 'FI10090/20'],
    [false, 'NOME-A SM', 'FI10090/20'],
    [false, 'NOWT SM', 'FI10090/20'],
  ])('should return %p when eventType is %p and regNo is %p', (expected, eventType, regNo) => {
    expect(
      validateDog(
        {
          eventType,
          startDate: new Date('2024-10-15'),
        },
        { dog: { ...testDog, kcId: 123, regNo } }
      )
    ).toEqual(expected)
  })

  it.each(['NOU', 'NOME-B', 'NOME-A', 'NOWT'])('should accept foreign dog from %p event', (eventType) => {
    expect(
      validateDog(
        {
          eventType,
          startDate: new Date('2024-10-15'),
        },
        { dog: { ...testDog, kcId: 123, regNo: 'KCSB4027CU' } }
      )
    ).toEqual(false)
  })

  describe('results', function () {
    describe('NOU', function () {
      it('Should allow a dog with no results', function () {
        expect(
          filterRelevantResults({ eventType: 'NOU', startDate: new Date('2022-08-01') }, undefined, []).qualifies
        ).toEqual(true)
      })
    })

    describe('NOME-B - ALO', function () {
      it('Should allow a dog with NOU1', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') }
        const NOU1 = {
          type: 'NOU',
          result: 'NOU1',
          class: '',
          date: new Date('2022-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1]).qualifies).toEqual(true)
      })

      it('Should reject a dog with NOU0', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') }
        const NOU0 = {
          type: 'NOU',
          result: 'NOU0',
          class: '',
          date: new Date('2022-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU0]).qualifies).toEqual(false)
      })

      it('Should allow a dog with 2xALO1 the same year 2016..2022', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2018-08-01') }
        const NOU1 = {
          type: 'NOU',
          result: 'NOU1',
          class: '',
          date: new Date('2015-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_2 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2018-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1_1, ALO1_2]).qualifies).toEqual(true)
      })

      it('Should reject a dog with 2xALO1 the next year 2016..2022', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2019-08-01') }
        const NOU1 = {
          type: 'NOU',
          result: 'NOU1',
          class: '',
          date: new Date('2022-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_2 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2018-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1_1, ALO1_2]).qualifies).toEqual(false)
      })

      it('Should reject a dog with any AVO result', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') }
        const NOU1 = {
          type: 'NOU',
          result: 'NOU1',
          class: '',
          date: new Date('2022-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO2 = {
          type: 'NOME-B',
          result: 'AVO2',
          class: 'AVO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, AVO2]).qualifies).toEqual(false)
      })

      it('Should change result.qualifying from false to undefined when manual results are updated back and forth', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2018-08-01') }
        const NOU1 = {
          type: 'NOU',
          result: 'NOU1',
          class: '',
          date: new Date('2015-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_2 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2018-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const r1 = filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1_1, ALO1_2])
        expect(r1.qualifies).toEqual(true)
        expect(r1.relevant.map((r) => r.qualifying)).toEqual([true, undefined, undefined])

        ALO1_2.date = new Date('2017-06-15')
        const r2 = filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1_1, ALO1_2])
        expect(r2.qualifies).toEqual(false)
        expect(r2.relevant.map((r) => r.qualifying)).toEqual([true, false, false])

        ALO1_2.date = new Date('2018-06-16')
        const r3 = filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1_1, ALO1_2])
        expect(r3.qualifies).toEqual(true)
        expect(r3.relevant.map((r) => r.qualifying)).toEqual([true, undefined, undefined])
      })
    })

    describe('NOME-B - AVO', function () {
      it('Should allow a dog with 2xALO1 2016..2022', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') }
        const ALO1_1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_2 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1_1, ALO1_2]).qualifies).toEqual(true)
      })

      it('Should reject a dog with only 1xALO1 2016..2022', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') }
        const ALO2 = {
          type: 'NOME-B',
          result: 'ALO2',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO2, ALO1]).qualifies).toEqual(false)
      })

      it('Should allow a dog with 2xAVO1 the same year 2016..2022', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2018-08-01') }
        const ALO1_1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_2 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2017-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1_1 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2017-07-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1_2 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2018-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1_1, ALO1_2, AVO1_1, AVO1_2]).qualifies).toEqual(true)
      })

      it('Should reject a dog with 2xAVO1 the next year 2016..2022', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2019-08-01') }
        const ALO1_1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_2 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2017-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1_1 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2017-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1_2 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2018-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1_1, ALO1_2, AVO1_1, AVO1_2]).qualifies).toEqual(false)
      })

      it('Should reject a dog with any VOI result', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') }
        const ALO1_1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_2 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2017-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const VOI = {
          type: 'NOME-B',
          result: 'VOI-',
          class: 'VOI',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1_1, ALO1_2, VOI]).qualifies).toEqual(false)
      })

      it('Should allow a dog with 1xALO1 2009..2015', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2015-06-01') }
        const ALO1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2014-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1]).qualifies).toEqual(true)
      })

      it('Should allow a dog with 1xALO1 2005..2008', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2008-06-01') }
        const ALO1 = {
          type: 'NOME-B',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2007-07-12'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1]).qualifies).toEqual(true)
      })
    })

    describe('NOME-B - VOI', function () {
      it('Should allow a dog with 2xAVO1 2016..2022', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-06-01') }
        const AVO1_1 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1_2 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'VOI', [AVO1_1, AVO1_2]).qualifies).toEqual(true)
      })

      it('Should reject a dog with only 1xAVO1 2016..2022', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') }
        const AVO2 = {
          type: 'NOME-B',
          result: 'AVO2',
          class: 'AVO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'VOI', [AVO2, AVO1]).qualifies).toEqual(false)
      })

      it('Should allow a dog with 1xAVO1 2006..2008', function () {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2007-08-01') }
        const AVO2 = {
          type: 'NOME-B',
          result: 'AVO2',
          class: 'AVO',
          date: new Date('2006-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2007-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'VOI', [AVO2, AVO1]).qualifies).toEqual(true)
      })
    })

    describe('NOWT - ALO', function () {
      it('Should allow a dog with NOU1', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') }
        const NOU1 = {
          type: 'NOU',
          result: 'NOU1',
          class: '',
          date: new Date('2022-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1]).qualifies).toEqual(true)
      })

      it('Should reject a dog with NOU0', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') }
        const NOU0 = {
          type: 'NOU',
          result: 'NOU0',
          class: '',
          date: new Date('2022-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU0]).qualifies).toEqual(false)
      })

      it('Should allow a dog with ALO1 the same year 2016..2022', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2018-08-01') }
        const NOU1 = {
          type: 'NOU',
          result: 'NOU1',
          class: '',
          date: new Date('2022-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1 = {
          type: 'NOWT',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2018-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1]).qualifies).toEqual(true)
      })

      it('Should reject a dog with ALO1 the next year 2016..2022', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2019-08-01') }
        const NOU1 = {
          type: 'NOU',
          result: 'NOU1',
          class: '',
          date: new Date('2022-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1 = {
          type: 'NOWT',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2018-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1]).qualifies).toEqual(false)
      })

      it('Should reject a dog with any AVO result', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') }
        const NOU1 = {
          type: 'NOU',
          result: 'NOU1',
          class: '',
          date: new Date('2022-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO0 = {
          type: 'NOWT',
          result: 'AVO0',
          class: 'AVO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, AVO0]).qualifies).toEqual(false)
      })
    })

    describe('NOWT - AVO', function () {
      it('Should allow a dog with 1xALO1', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') }
        const ALO1_1 = {
          type: 'NOWT',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const ALO1_2 = {
          type: 'NOWT',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1_1, ALO1_2]).qualifies).toEqual(true)
      })

      it('Should reject a dog with no ALO1', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') }
        const ALO2 = {
          type: 'NOWT',
          result: 'ALO2',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO2]).qualifies).toEqual(false)
      })

      it('Should allow a dog with AVO1 the same year', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2018-08-01') }
        const ALO1 = {
          type: 'NOWT',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1 = {
          type: 'NOWT',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2018-07-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1, AVO1, AVO1]).qualifies).toEqual(true)
      })

      it('Should reject a dog with 2xAVO1 the next year', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2019-08-01') }
        const ALO1 = {
          type: 'NOWT',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1 = {
          type: 'NOWT',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2018-07-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1, AVO1]).qualifies).toEqual(false)
      })

      it('Should reject a dog with any VOI result', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') }
        const ALO1 = {
          type: 'NOWT',
          result: 'ALO1',
          class: 'ALO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const VOI = {
          type: 'NOWT',
          result: 'VOI-',
          class: 'VOI',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1, VOI]).qualifies).toEqual(false)
      })
    })

    describe('NOWT - VOI', function () {
      it('Should allow a dog with AVO1', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-06-01') }
        const AVO1 = {
          type: 'NOWT',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'VOI', [AVO1]).qualifies).toEqual(true)
      })

      it('Should reject a dog with no AVO1', function () {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') }
        const AVO2 = {
          type: 'NOWT',
          result: 'AVO2',
          class: 'AVO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, 'VOI', [AVO2]).qualifies).toEqual(false)
      })
    })

    describe('NOME-A', function () {
      it('Should allow a dog with 2x NOME-B AVO1', function () {
        const testEvent = { eventType: 'NOME-A', startDate: new Date('2022-06-01') }
        const AVO1_1 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1_2 = {
          type: 'NOME-B',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, undefined, [AVO1_1, AVO1_2]).qualifies).toEqual(true)
      })

      it('Should allow a dog with 2x NOWT AVO1', function () {
        const testEvent = { eventType: 'NOME-A', startDate: new Date('2022-06-01') }
        const AVO1_1 = {
          type: 'NOWT',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const AVO1_2 = {
          type: 'NOWT',
          result: 'AVO1',
          class: 'AVO',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, undefined, [AVO1_1, AVO1_2]).qualifies).toEqual(true)
      })

      it.todo('Should allow a dog rewarded in international field trial')
    })

    describe('NKM', function () {
      it('Should allow a dog with 2x NOME-B VOI1', function () {
        const testEvent = { eventType: 'NKM', startDate: new Date('2022-08-20') }
        const VOI1_1 = {
          type: 'NOME-B',
          result: 'VOI1',
          class: 'VOI',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const VOI1_2 = {
          type: 'NOME-B',
          result: 'VOI1',
          class: 'VOI',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, undefined, [VOI1_1, VOI1_2]).qualifies).toEqual(true)
      })

      it('Should allow a dog with 2x CERT from NOWT', function () {
        const testEvent = { eventType: 'NKM', startDate: new Date('2022-08-20') }
        const VOI1_1 = {
          type: 'NOWT',
          result: 'VOI1',
          cert: true,
          class: 'VOI',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const VOI1_2 = {
          type: 'NOWT',
          result: 'VOI1',
          cert: true,
          class: 'VOI',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, undefined, [VOI1_1, VOI1_2]).qualifies).toEqual(true)
      })

      it('Should reject a dog with only 1x NOME-B VOI1 + 1x CERT from NOWT', function () {
        const testEvent = { eventType: 'NKM', startDate: new Date('2022-08-20') }
        const RES1 = {
          type: 'NOME-B',
          result: 'VOI1',
          class: 'VOI',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const RES2 = {
          type: 'NOWT',
          result: 'VOI1',
          cert: true,
          class: 'VOI',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, undefined, [RES1, RES2]).qualifies).toEqual(false)
      })

      it('Should reject a dog with only 1x CERT from NOWT', function () {
        const testEvent = { eventType: 'NKM', startDate: new Date('2022-08-20') }
        const VOI1_1 = {
          type: 'NOWT',
          result: 'VOI1',
          cert: false,
          class: 'VOI',
          date: new Date('2016-05-30'),
          location: 'Test',
          judge: 'Test Judge',
        }
        const VOI1_2 = {
          type: 'NOWT',
          result: 'VOI1',
          cert: true,
          class: 'VOI',
          date: new Date('2016-06-15'),
          location: 'Test',
          judge: 'Test Judge',
        }
        expect(filterRelevantResults(testEvent, undefined, [VOI1_1, VOI1_2]).qualifies).toEqual(false)
      })
    })
  })
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
