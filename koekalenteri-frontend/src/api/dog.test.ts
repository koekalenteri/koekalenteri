import { Dog } from "koekalenteri-shared/model"
import { rehydrateDog } from "./dog";


test('rehydrateDog', function() {
  const dog: Dog = { regNo: 'abc', name: 'def', rfid: '', breedCode: '', dob: '20210101T00:00:00', refreshDate: '20200101T00:00:00' };
  const rdog = rehydrateDog(dog);

  expect(rdog).toEqual(dog);
  expect(dog.dob).toBeInstanceOf(Date);
  expect(dog.refreshDate).toBeInstanceOf(Date);
})
