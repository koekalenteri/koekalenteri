const mockOfficials = [
  {
    name: "Toimitsija 1",
    id: 333,
    location: "Helsinki",
    phone: "123456781",
    email: "toimari1@sposti.not"
  },
  {
    name: "Toimitsija 2",
    id: 444,
    location: "Tampere",
    phone: "123456782",
    email: "toimari2@sposti.not"
  },
  {
    name: "Toimitsija 3",
    id: 555,
    location: "Turku",
    phone: "123456783",
    email: "toimari3@sposti.not"
  },
];

export async function getOfficials() {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockOfficials));
  });
}
