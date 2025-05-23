const { marshall } = require('@aws-sdk/util-dynamodb')
const { writeFileSync } = require('fs')

const marshalled = marshall({
  allowHandlerMembershipPriority: true,
  contactInfo: {
    secretary: {
      name: true,
      phone: true,
      email: true,
    },
  },
  entryStartDate: '2022-02-15T22:00:00.000Z',
  endDate: '2022-04-25T00:00:00.000Z',
  modifiedAt: '2022-03-25T18:21:14.127Z',
  classes: [
    {
      date: '2022-04-23T21:00:00.000Z',
      places: 15,
      entries: 2,
      judge: {
        name: 'Tuomari 3',
        id: 100003,
      },
      class: 'ALO',
    },
    {
      date: '2022-04-24T21:00:00.000Z',
      places: 15,
      judge: {
        name: 'Tuomari 3',
        id: 100003,
      },
      class: 'ALO',
    },
    {
      date: '2022-04-24T21:00:00.000Z',
      places: 15,
      judge: {
        name: 'Tuomari 3',
        id: 100003,
      },
      class: 'AVO',
    },
    {
      date: '2022-04-24T21:00:00.000Z',
      places: 12,
      judge: {
        name: 'Tuomari 1',
        id: 100001,
      },
      class: 'VOI',
    },
  ],
  allowOwnerMembershipPriority: true,
  description: 'Pietun pysti jaossa ALO-luokassa',
  official: {
    name: 'Toimari 3',
    location: 'Turku',
    id: 333,
    phone: '123456783',
    email: 'toimari3@sposti.not',
  },
  allowOnlinePayment: true,
  createdAt: '2022-03-25T18:21:14.127Z',
  secretary: {
    name: 'Toimari2 2',
    location: 'Tampere',
    id: 222,
    phone: '123456782',
    email: 'toimari2@sposti.not',
  },
  modifiedBy: 'anonymous',
  id: '0001',
  state: 'confirmed',
  unofficial: false,
  kcId: '123',
  cost: 40,
  eventType: 'NOME-B',
  requirePaymentBeforeEntry: false,
  entries: 2,
  places: 57,
  costMember: 35,
  createdBy: 'anonymous',
  organizer: {
    name: 'Järjestäjä 1',
    id: 1,
  },
  name: 'Nuusku',
  entryEndDate: '2022-04-15T00:00:00.000Z',
  location: 'Liperi',
  allowOnlineEntry: true,
  judges: [100003, 100001],
  startDate: '2022-04-24T00:00:00.000Z',
})

writeFileSync('./marshalled.json', JSON.stringify(marshalled))
