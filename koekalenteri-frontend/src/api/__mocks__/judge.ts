const mockJudges = [
  {
    name: "Tuomari 1",
    id: 888888,
    location: "Helsinki",
    district: "Uusimaa",
    phone: "123456789",
    email: "tuomari1@sposti.not"
  },
  {
    name: "Tuomari 2",
    id: 999999,
    location: "Tampere",
    district: "Tampere",
    phone: "123456788",
    email: "tuomari2@sposti.not"
  },
  {
    name: "Tuomari 3",
    id: 777777,
    location: "Turku",
    district: "Turku",
    phone: "123456787",
    email: "tuomari3@sposti.not"
  },
];

export async function getJudges() {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockJudges));
  });
}
