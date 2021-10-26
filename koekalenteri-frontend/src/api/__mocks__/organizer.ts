const mockOrganizers = [
  {
    name: "Järjestäjä 1",
    id: 1,
  },
  {
    name: "Järjestäjä 1",
    id: 1,
  },
];

export async function getOrganizers() {
  return new Promise((resolve, reject) => {
    process.nextTick(() => resolve(mockOrganizers));
  });
}
