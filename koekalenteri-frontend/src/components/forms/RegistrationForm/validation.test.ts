import { BreedCode } from 'koekalenteri-shared/model';
import { validateDog, filterRelevantResults } from './validation';

const testDog = {
  regNo: 'test-123',
  rfid: 'test-id',
  name: 'Test Dog',
  dob: new Date('2018-03-28'),
  results: [],
  sire: { titles: '', name: 'Sire' },
  dam: { titles: '', name: 'Dam' }
};

describe('validateDog', function() {
  it('Should validate registration number', function() {
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') };
    expect(validateDog(testEvent, { dog: testDog })).toEqual(false);
    expect(validateDog(testEvent, { dog: {...testDog, regNo: '' }})).toEqual('required');
  });

  it('Should validate identification number', function() {
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') };
    expect(validateDog(testEvent, { dog: testDog })).toEqual(false);
    expect(validateDog(testEvent, { dog: { ...testDog, rfid: '' } })).toEqual('required');
  });

  it('Should validate name', function() {
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') };
    expect(validateDog(testEvent, { dog: testDog })).toEqual(false);
    expect(validateDog(testEvent, { dog: { ...testDog, name: '' } })).toEqual('required');
  });

  it('Should validate dog breed', function() {
    const valid: Array<BreedCode> = ['110', '111', '121', '122', '263', '312'];
    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') };
    for (const test of valid) {
      expect(validateDog(testEvent, { dog: { ...testDog, breedCode: test } }))
        .toEqual(false);
    }
    const invalid: Array<BreedCode> = ['1', '13', '148.1P'];
    for (const test of invalid) {
      expect(validateDog(testEvent, { dog: { ...testDog, breedCode: test } }))
        .toEqual({ key: 'dogBreed', opts: { field: 'dog', type: test.replace('.', '-') } });
    }
  });

  it('Should validate dog age', function() {
    const cases = [{
      dob: '2021-01-01',
      result: { key: 'dogAge', opts: { field: 'dog', length: 9 } }
    }, {
      dob: '2020-01-16',
      result: { key: 'dogAge', opts: { field: 'dog', length: 9 } }
    }, {
      dob: '2020-01-15',
      result: false
    }, {
      dob: '2010-01-01',
      result: false
    }];

    const testEvent = { eventType: 'NOU', startDate: new Date('2020-10-15') };
    for (const test of cases) {
      expect(validateDog(testEvent, { dog: { ...testDog, dob: new Date(test.dob) } }))
        .toEqual(test.result);
    }
  });

  describe('results', function() {
    describe('NOU', function() {
      it('Should allow a dog with no results', function() {
        expect(filterRelevantResults({ eventType: 'NOU', startDate: new Date('2022-08-01') }, undefined, []).qualifies)
          .toEqual(true);
      });
    });

    describe('NOME-B - ALO', function() {
      it('Should allow a dog with NOU1', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') };
        const NOU1 = { type: 'NOU', result: 'NOU1', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with NOU0', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') };
        const NOU0 = { type: 'NOU', result: 'NOU0', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU0]).qualifies)
          .toEqual(false);
      });

      it('Should allow a dog with 2xALO1 the same year 2016..2022', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2018-08-01') };
        const NOU1 = { type: 'NOU', result: 'NOU1', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1_1 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1_2 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2018-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1_1, ALO1_2]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with 2xALO1 the next year 2016..2022', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2019-08-01') };
        const NOU1 = { type: 'NOU', result: 'NOU1', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1_1 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1_2 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2018-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1_1, ALO1_2]).qualifies)
          .toEqual(false);
      });

      it('Should reject a dog with any AVO result', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') };
        const NOU1 = { type: 'NOU', result: 'NOU1', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO2 = { type: 'NOME-B', result: 'AVO2', class: 'AVO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, AVO2]).qualifies)
          .toEqual(false);
      });
    });

    describe('NOME-B - AVO', function() {
      it('Should allow a dog with 2xALO1 2016..2022', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') };
        const ALO1_1 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1_2 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent,'AVO', [ALO1_1, ALO1_2]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with only 1xALO1 2016..2022', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') };
        const ALO2 = { type: 'NOME-B', result: 'ALO2', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO2, ALO1]).qualifies)
          .toEqual(false);
      });

      it('Should allow a dog with 2xAVO1 the same year 2016..2022', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2018-08-01') };
        const ALO1_1 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1_2 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2017-06-15'), location: 'Test', judge: 'Test Judge' };
        const AVO1_1 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2017-07-30'), location: 'Test', judge: 'Test Judge' };
        const AVO1_2 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2018-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1_1, ALO1_2, AVO1_1, AVO1_2]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with 2xAVO1 the next year 2016..2022', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2019-08-01') };
        const ALO1_1 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1_2 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2017-06-15'), location: 'Test', judge: 'Test Judge' };
        const AVO1_1 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2017-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO1_2 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2018-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1_1, ALO1_2, AVO1_1, AVO1_2]).qualifies)
          .toEqual(false);
      });

      it('Should reject a dog with any VOI result', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') };
        const ALO1_1 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1_2 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2017-06-15'), location: 'Test', judge: 'Test Judge' };
        const VOI = { type: 'NOME-B', result: 'VOI-', class: 'VOI', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1_1, ALO1_2, VOI]).qualifies)
          .toEqual(false);
      });

      it('Should allow a dog with 1xALO1 2009..2015', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2015-06-01') };
        const ALO1 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2014-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1]).qualifies)
          .toEqual(true);
      });

      it('Should allow a dog with 1xALO1 2005..2008', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2008-06-01') };
        const ALO1 = { type: 'NOME-B', result: 'ALO1', class: 'ALO', date: new Date('2007-07-12'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1]).qualifies)
          .toEqual(true);
      });
    });

    describe('NOME-B - VOI', function() {
      it('Should allow a dog with 2xAVO1 2016..2022', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-06-01') };
        const AVO1_1 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO1_2 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'VOI', [AVO1_1, AVO1_2]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with only 1xAVO1 2016..2022', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2022-08-01') };
        const AVO2 = { type: 'NOME-B', result: 'AVO2', class: 'AVO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO1 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'VOI', [AVO2, AVO1]).qualifies)
          .toEqual(false);
      });

      it('Should allow a dog with 1xAVO1 2006..2008', function() {
        const testEvent = { eventType: 'NOME-B', startDate: new Date('2007-08-01') };
        const AVO2 = { type: 'NOME-B', result: 'AVO2', class: 'AVO', date: new Date('2006-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO1 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2007-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'VOI', [AVO2, AVO1]).qualifies)
          .toEqual(true);
      });
    });

    describe('NOWT - ALO', function() {
      it('Should allow a dog with NOU1', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') };
        const NOU1 = { type: 'NOU', result: 'NOU1', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with NOU0', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') };
        const NOU0 = { type: 'NOU', result: 'NOU0', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU0]).qualifies)
          .toEqual(false);
      });

      it('Should allow a dog with ALO1 the same year 2016..2022', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2018-08-01') };
        const NOU1 = { type: 'NOU', result: 'NOU1', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1 = { type: 'NOWT', result: 'ALO1', class: 'ALO', date: new Date('2018-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with ALO1 the next year 2016..2022', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2019-08-01') };
        const NOU1 = { type: 'NOU', result: 'NOU1', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1 = { type: 'NOWT', result: 'ALO1', class: 'ALO', date: new Date('2018-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, ALO1]).qualifies)
          .toEqual(false);
      });

      it('Should reject a dog with any AVO result', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') };
        const NOU1 = { type: 'NOU', result: 'NOU1', class: '', date: new Date('2022-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO0 = { type: 'NOWT', result: 'AVO0', class: 'AVO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'ALO', [NOU1, AVO0]).qualifies)
          .toEqual(false);
      });
    });

    describe('NOWT - AVO', function() {
      it('Should allow a dog with 1xALO1', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') };
        const ALO1_1 = { type: 'NOWT', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const ALO1_2 = { type: 'NOWT', result: 'ALO1', class: 'ALO', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1_1, ALO1_2]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with no ALO1', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') };
        const ALO2 = { type: 'NOWT', result: 'ALO2', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO2]).qualifies)
          .toEqual(false);
      });

      it('Should allow a dog with AVO1 the same year', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2018-08-01') };
        const ALO1 = { type: 'NOWT', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO1 = { type: 'NOWT', result: 'AVO1', class: 'AVO', date: new Date('2018-07-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1, AVO1, AVO1]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with 2xAVO1 the next year', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2019-08-01') };
        const ALO1 = { type: 'NOWT', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO1 = { type: 'NOWT', result: 'AVO1', class: 'AVO', date: new Date('2018-07-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1, AVO1]).qualifies)
          .toEqual(false);
      });

      it('Should reject a dog with any VOI result', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') };
        const ALO1 = { type: 'NOWT', result: 'ALO1', class: 'ALO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const VOI = { type: 'NOWT', result: 'VOI-', class: 'VOI', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'AVO', [ALO1, VOI]).qualifies)
          .toEqual(false);
      });
    });

    describe('NOWT - VOI', function() {
      it('Should allow a dog with AVO1', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-06-01') };
        const AVO1 = { type: 'NOWT', result: 'AVO1', class: 'AVO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'VOI', [AVO1]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with no AVO1', function() {
        const testEvent = { eventType: 'NOWT', startDate: new Date('2022-08-01') };
        const AVO2 = { type: 'NOWT', result: 'AVO2', class: 'AVO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, 'VOI', [AVO2]).qualifies)
          .toEqual(false);
      });
    });

    describe('NOME-A', function() {
      it('Should allow a dog with 2x NOME-B AVO1', function() {
        const testEvent = { eventType: 'NOME-A', startDate: new Date('2022-06-01') };
        const AVO1_1 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO1_2 = { type: 'NOME-B', result: 'AVO1', class: 'AVO', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, undefined, [AVO1_1, AVO1_2]).qualifies)
          .toEqual(true);
      });

      it('Should allow a dog with 2x NOWT AVO1', function() {
        const testEvent = { eventType: 'NOME-A', startDate: new Date('2022-06-01') };
        const AVO1_1 = { type: 'NOWT', result: 'AVO1', class: 'AVO', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const AVO1_2 = { type: 'NOWT', result: 'AVO1', class: 'AVO', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, undefined, [AVO1_1, AVO1_2]).qualifies)
          .toEqual(true);
      });

      it.todo('Should allow a dog rewarded in international field trial');
    });

    describe('NKM', function() {
      it('Should allow a dog with 2x NOME-B VOI1', function() {
        const testEvent = { eventType: 'NKM', startDate: new Date('2022-08-20') };
        const VOI1_1 = { type: 'NOME-B', result: 'VOI1', class: 'VOI', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const VOI1_2 = { type: 'NOME-B', result: 'VOI1', class: 'VOI', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, undefined, [VOI1_1, VOI1_2]).qualifies)
          .toEqual(true);
      });

      it('Should allow a dog with 2x CERT from NOWT', function() {
        const testEvent = { eventType: 'NKM', startDate: new Date('2022-08-20') };
        const VOI1_1 = { type: 'NOWT', result: 'VOI1', cert: true, class: 'VOI', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const VOI1_2 = { type: 'NOWT', result: 'VOI1', cert: true, class: 'VOI', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, undefined, [VOI1_1, VOI1_2]).qualifies)
          .toEqual(true);
      });

      it('Should reject a dog with only 1x NOME-B VOI1 + 1x CERT from NOWT', function() {
        const testEvent = { eventType: 'NKM', startDate: new Date('2022-08-20') };
        const RES1 = { type: 'NOME-B', result: 'VOI1', class: 'VOI', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const RES2 = { type: 'NOWT', result: 'VOI1', cert: true, class: 'VOI', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, undefined, [RES1, RES2]).qualifies)
          .toEqual(false);
      });

      it('Should reject a dog with only 1x CERT from NOWT', function() {
        const testEvent = { eventType: 'NKM', startDate: new Date('2022-08-20') };
        const VOI1_1 = { type: 'NOWT', result: 'VOI1', cert: false, class: 'VOI', date: new Date('2016-05-30'), location: 'Test', judge: 'Test Judge' };
        const VOI1_2 = { type: 'NOWT', result: 'VOI1', cert: true, class: 'VOI', date: new Date('2016-06-15'), location: 'Test', judge: 'Test Judge' };
        expect(filterRelevantResults(testEvent, undefined, [VOI1_1, VOI1_2]).qualifies)
          .toEqual(false);
      });
    });
  });
});
