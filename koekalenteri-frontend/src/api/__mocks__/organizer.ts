const mockOrganizers = [
  {
    id: 1,
    name: "Järjestäjä 1",
  },
  {
    id: 2,
    name: "Järjestäjä 2",
  },
];

export async function getOrganizers() {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockOrganizers));
  });
}
