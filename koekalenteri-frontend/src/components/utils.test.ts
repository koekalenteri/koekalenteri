import { dateSpan } from './utils';

describe('utils', () => {
  describe('dateSpan', () => {
    it('should format properly', () => {
      expect(dateSpan('2021-01-01', '2021-01-02')).toEqual('1.-2.1.2021');
      expect(dateSpan('2021-01-31', '2021-02-02')).toEqual('31.1.-2.2.2021');
      expect(dateSpan('2021-12-15', '2022-01-15')).toEqual('15.12.2021-15.1.2022');
    });
  });
});
