import { subMonths } from "date-fns"
import { Dog } from "koekalenteri-shared/model"

import { eventWithStaticDates } from "./events"

export const registrationDogAged10MonthsAndNoResults: Dog = {
  regNo: 'TESTDOG-10',
  breedCode: '110',
  gender: 'M',
  dob: subMonths(eventWithStaticDates.startDate, 10),
  refreshDate: eventWithStaticDates.entryStartDate,
  rfid: '1234567890123456',
  name: 'Dog Name',
  titles: "Dog titles",
  callingName: 'Test',
  sire: {
    name: "Sire Name",
    titles: "Sire titles",
  },
  dam: {
    name: "Dam Name",
    titles: "Dam titles",
  },
  results: [],
}
