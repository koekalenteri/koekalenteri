import { Dog } from "koekalenteri-shared/model"

export async function getDog(regNo: string, refresh?: boolean, signal?: AbortSignal): Promise<Dog> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve({
      regNo,
      name: 'Test Dog',
      rfid: 'rfid',
      dob: new Date('20220101T00:00:00'),
      gender: 'M',
      breedCode: '121',
      titles: '',
      results: [],
    }))
  })
}
