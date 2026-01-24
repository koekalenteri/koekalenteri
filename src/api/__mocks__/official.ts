const mockOfficials = [
  {
    email: 'toimari1@sposti.not',
    id: 333,
    location: 'Helsinki',
    name: 'Toimitsija 1',
    phone: '123456781',
  },
  {
    email: 'toimari2@sposti.not',
    id: 444,
    location: 'Tampere',
    name: 'Toimitsija 2',
    phone: '123456782',
  },
  {
    email: 'toimari3@sposti.not',
    id: 555,
    location: 'Turku',
    name: 'Toimitsija 3',
    phone: '123456783',
  },
]

export async function getOfficials(_token: string, _refresh?: boolean, _signal?: AbortSignal) {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockOfficials))
  })
}
