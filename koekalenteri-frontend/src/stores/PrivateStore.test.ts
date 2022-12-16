import { PrivateStore } from "./PrivateStore"

jest.mock('../api/event')
jest.mock('../api/official')

const store = new PrivateStore()

describe('PrivateStore', () => {
  it('should load', async () => {
    expect(store.loading).toEqual(false)
    expect(store.loaded).toEqual(false)

    const promise = store.load()
    expect(store.loading).toEqual(true)
    await promise

    expect(store.loaded).toEqual(true)
    expect(store.events.length).toEqual(5)
  })

  it('should add a new evend', async () => {
    const origLength = store.events.length

    const newEvent = await store.putEvent({ eventType: 'saveTest' })

    expect(newEvent.id).toBeDefined()
    expect(store.events.length).toBe(origLength + 1)
  })

  it('should select an event', async () => {
    const testEvent = store.events[1]
    expect(store.selectedEvent).not.toBeDefined()
    await store.selectEvent(testEvent.id)
    expect(store.selectedEvent).toEqual(testEvent)
    await store.selectEvent()
    expect(store.selectedEvent).not.toBeDefined()
  })

  it('should delete an event', async () => {
    const origLength = store.events.length
    const testEvent = store.events[origLength - 1]

    const deletedEvent = await store.deleteEvent(testEvent)
    expect(deletedEvent).toBeDefined()
    expect(deletedEvent?.deletedAt).toBeDefined()

    expect(store.events.length).toBe(origLength - 1)
  })
})
