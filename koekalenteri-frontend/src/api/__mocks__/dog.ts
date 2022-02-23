import { Dog } from "koekalenteri-shared/model";
import { rehydrateDog } from "../dog";

export async function getDog(regNo: string, refresh?: boolean, signal?: AbortSignal): Promise<Dog> {
  return new Promise((resolve, reject) => {
    process.nextTick(() => resolve(rehydrateDog({
      regNo,
      name: 'Test Dog',
      rfid: 'rfid',
      dob: '20220101T00:00:00',
      gender: 'M',
      breedCode: '121'
    })));
  });
}
