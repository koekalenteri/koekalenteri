import type { DogEvent, KcEventInfo } from '@/types'
import type { Props } from './KcIdSection'
import type { PartialEvent } from './types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { screen } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '@/__mockData__/events'
import * as eventApi from '@/api/event'
import { locales } from '@/i18n'
import { patchMerge } from '@/lib/utils'
import { idTokenAtom } from '@/pages/state'
import { finnishDayOf } from '@/test-utils/finnishDays'
import { flushPromises, renderWithUserEvents } from '@/test-utils/utils'
import { adminEventsAtom } from '../../state'
import KcIdSection from './KcIdSection'

vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

/** Events other than the one being edited, whose Kennelliitto trials are therefore already spoken for. */
const renderComponent = async (props: Props, otherEvents: DogEvent[] = []) => {
  const rendered = renderWithUserEvents(
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <Provider
        initializeState={({ set }) => {
          set(idTokenAtom, 'id-token')
          set(adminEventsAtom, otherEvents)
        }}
      >
        <KcIdSection {...props} />
      </Provider>
    </LocalizationProvider>,
    undefined
  )
  // The linked koetunnukset and the event type's officialness resolve after the first paint; a test
  // that read the screen before they had would leave their updates to land outside act, as warnings.
  await flushPromises()
  return rendered
}

const eventLinkedTo = (kcGuid: string): DogEvent => ({ ...eventWithStaticDates, id: `linked-${kcGuid}`, kcGuid })

describe('KcIdSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render', async () => {
    const testEvent: PartialEvent = {
      classes: [],
      endDate: '2022-06-02',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2022-06-01',
    }
    await renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    expect(screen.getByText('event.kcIdLookup')).toBeInTheDocument()
  })

  it('should tell the user to pick an organizer before a lookup is possible', async () => {
    const testEvent: PartialEvent = {
      classes: [],
      endDate: '2022-06-02',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      startDate: '2022-06-01',
    }

    await renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    expect(screen.getByText('event.kcIdRequiresOrganizer')).toBeInTheDocument()
    expect(screen.queryByText('event.kcIdLookup')).not.toBeInTheDocument()
  })

  it('should not show the organizer hint once an organizer is selected', async () => {
    const testEvent: PartialEvent = {
      classes: [],
      endDate: '2022-06-02',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2022-06-01',
    }

    await renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    expect(screen.queryByText('event.kcIdRequiresOrganizer')).not.toBeInTheDocument()
    expect(screen.getByText('event.kcIdLookup')).toBeInTheDocument()
  })

  it('should apply the single matching Kennel Club event directly without a picker', async () => {
    const searchEventKcIdChoices = vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
      choices: [
        {
          classes: ['ALO', 'AVO'],
          endDate: '2026-07-02',
          eventType: 'NOME-B',
          kcGuid: 'guid-222',
          location: 'Espoo',
          name: 'Toinen koe',
          organizer: 'Järjestäjä',
          startDate: '2026-07-01',
        },
      ],
    })
    const changeHandler = vi.fn()
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: '2026-06-01' }],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    const { user } = await renderComponent({ event: testEvent, onChange: changeHandler, open: true })

    await user.click(screen.getByText('event.kcIdLookup'))
    await flushPromises()

    expect(searchEventKcIdChoices).toHaveBeenCalledWith(
      expect.objectContaining({
        classes: [{ class: 'ALO', date: testEvent.classes[0].date }],
        endDate: testEvent.endDate,
        eventType: 'NOME-B',
        organizer: { id: 'org-id' },
        startDate: testEvent.startDate,
      }),
      'id-token'
    )
    expect(screen.queryByText('event.kcIdChoiceTitle')).not.toBeInTheDocument()
    // exact top-level match: linking must not touch the event's own fields (that's the whole
    // point of the snapshot): only kcEvent/kcGuid are set, nothing else (the old kcId is left alone)
    expect(changeHandler).toHaveBeenLastCalledWith({
      kcEvent: expect.objectContaining({
        classes: ['ALO', 'AVO'],
        eventType: 'NOME-B',
        location: 'Espoo',
      }),
      kcGuid: 'guid-222',
    })
    expect(finnishDayOf(changeHandler.mock.lastCall?.[0].kcEvent.startDate)).toEqual('2026-07-01')
    expect(finnishDayOf(changeHandler.mock.lastCall?.[0].kcEvent.endDate)).toEqual('2026-07-02')
    expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcIdSelected', { variant: 'success' })
  })

  it('should let the user pick from multiple matching Kennel Club events', async () => {
    const searchEventKcIdChoices = vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
      choices: [
        {
          classes: ['ALO', 'AVO'],
          endDate: '2026-07-02',
          eventType: 'NOME-B',
          kcGuid: 'guid-222',
          location: 'Espoo',
          name: 'Toinen koe',
          organizer: 'Järjestäjä',
          startDate: '2026-07-01',
        },
        {
          classes: ['VOI'],
          endDate: '2026-08-02',
          eventType: 'NOME-B',
          kcGuid: 'guid-333',
          location: 'Vantaa',
          name: 'Kolmas koe',
          organizer: 'Järjestäjä',
          startDate: '2026-08-01',
        },
      ],
    })
    const changeHandler = vi.fn()
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: '2026-06-01' }],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    const { user } = await renderComponent({ event: testEvent, onChange: changeHandler, open: true })

    await user.click(screen.getByText('event.kcIdLookup'))
    expect(await screen.findByText('event.kcIdChoiceTitle')).toBeInTheDocument()
    expect(searchEventKcIdChoices).toHaveBeenCalledTimes(1)
    expect(screen.getByText('ALO, AVO')).toBeInTheDocument()
    expect(screen.getByText('VOI')).toBeInTheDocument()

    const selectButtons = screen.getAllByRole('button', { name: 'event.kcIdSelect' })
    expect(selectButtons[0]).toHaveClass('MuiButton-contained')
    expect(screen.getByRole('button', { name: 'close' })).toHaveClass('MuiButton-outlined')

    await user.click(selectButtons[0])
    await flushPromises()

    expect(changeHandler).toHaveBeenLastCalledWith({
      kcEvent: expect.objectContaining({ classes: ['ALO', 'AVO'], eventType: 'NOME-B', location: 'Espoo' }),
      kcGuid: 'guid-222',
    })
    expect(screen.queryByText('event.kcIdChoiceTitle')).not.toBeInTheDocument()
  })

  it('should refuse a single match that is already linked to another event', async () => {
    vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
      choices: [
        {
          classes: ['ALO', 'AVO'],
          endDate: '2026-07-02',
          eventType: 'NOME-B',
          kcGuid: 'guid-222',
          location: 'Espoo',
          name: 'Toinen koe',
          organizer: 'Järjestäjä',
          startDate: '2026-07-01',
        },
      ],
    })
    const changeHandler = vi.fn()
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: '2026-06-01' }],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    const { user } = await renderComponent({ event: testEvent, onChange: changeHandler, open: true }, [
      eventLinkedTo('guid-222'),
    ])
    await flushPromises()

    await user.click(screen.getByText('event.kcIdLookup'))
    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcGuidConflict', { variant: 'error' })
    expect(changeHandler).not.toHaveBeenCalled()
  })

  it('should not offer a choice that is already linked to another event', async () => {
    vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
      choices: [
        {
          classes: ['ALO', 'AVO'],
          endDate: '2026-07-02',
          eventType: 'NOME-B',
          kcGuid: 'guid-222',
          location: 'Espoo',
          name: 'Toinen koe',
          organizer: 'Järjestäjä',
          startDate: '2026-07-01',
        },
        {
          classes: ['VOI'],
          endDate: '2026-08-02',
          eventType: 'NOME-B',
          kcGuid: 'guid-333',
          location: 'Vantaa',
          name: 'Kolmas koe',
          organizer: 'Järjestäjä',
          startDate: '2026-08-01',
        },
      ],
    })
    const changeHandler = vi.fn()
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: '2026-06-01' }],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    const { user } = await renderComponent({ event: testEvent, onChange: changeHandler, open: true }, [
      eventLinkedTo('guid-222'),
    ])
    await flushPromises()

    await user.click(screen.getByText('event.kcIdLookup'))
    expect(await screen.findByText('event.kcIdChoiceTitle')).toBeInTheDocument()
    expect(screen.getByText('event.kcIdChoiceLinked')).toBeInTheDocument()

    const selectButtons = screen.getAllByRole('button', { name: 'event.kcIdSelect' })
    expect(selectButtons).toHaveLength(1)

    await user.click(selectButtons[0])
    await flushPromises()

    expect(changeHandler).toHaveBeenLastCalledWith({
      kcEvent: expect.objectContaining({ classes: ['VOI'] }),
      kcGuid: 'guid-333',
    })
  })

  describe('a trial without a GUID', () => {
    const searchEventKcIdChoices = (...kcTunnukset: Array<string | undefined>) =>
      vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
        choices: kcTunnukset.map((kcTunnus) => ({
          classes: [],
          endDate: '2026-06-01',
          eventType: 'NOME-B',
          kcGuid: null,
          kcTunnus,
          location: 'Espoo',
          name: 'Koe',
          organizer: 'Järjestäjä',
          startDate: '2026-06-01',
        })),
      })
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: '2026-06-01' }],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    it('is shown, not applied, when it is the only match, and cannot be selected', async () => {
      searchEventKcIdChoices(undefined)
      const changeHandler = vi.fn()

      const { user } = await renderComponent({ event: testEvent, onChange: changeHandler, open: true })
      await user.click(screen.getByText('event.kcIdLookup'))

      expect(await screen.findByText('event.kcIdChoiceTitle')).toBeInTheDocument()
      expect(screen.getByText('event.kcGuidMissing')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'event.kcIdSelect' })).not.toBeInTheDocument()
      expect(changeHandler).not.toHaveBeenCalled()
      expect(enqueueSnackbar).not.toHaveBeenCalled()
    })

    it('can be listed twice without a key clash, and neither can be selected', async () => {
      searchEventKcIdChoices(undefined, undefined)

      const { user } = await renderComponent({ event: testEvent, onChange: vi.fn(), open: true })
      await user.click(screen.getByText('event.kcIdLookup'))

      expect(await screen.findAllByText('event.kcGuidMissing')).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'event.kcIdSelect' })).not.toBeInTheDocument()
    })

    it('leaves the one with a GUID selectable beside it', async () => {
      vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
        choices: [
          {
            classes: [],
            endDate: '2026-06-01',
            eventType: 'NOME-B',
            kcGuid: null,
            location: 'Espoo',
            name: 'Koe',
            organizer: 'Järjestäjä',
            startDate: '2026-06-01',
          },
          {
            classes: [],
            endDate: '2026-06-01',
            eventType: 'NOME-B',
            kcGuid: 'guid-1',
            location: 'Espoo',
            name: 'Koe',
            organizer: 'Järjestäjä',
            startDate: '2026-06-01',
          },
        ],
      })

      const { user } = await renderComponent({ event: testEvent, onChange: vi.fn(), open: true })
      await user.click(screen.getByText('event.kcIdLookup'))

      expect(await screen.findAllByRole('button', { name: 'event.kcIdSelect' })).toHaveLength(1)
      expect(screen.getAllByText('event.kcGuidMissing')).toHaveLength(1)
    })
  })

  it("should not leave the previous trial's judge behind when the new trial has none", async () => {
    vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
      choices: [
        {
          classes: ['ALO'],
          endDate: '2026-07-02',
          eventType: 'NOME-B',
          kcGuid: 'guid-b',
          name: 'Koe B',
          organizer: 'Järjestäjä',
          startDate: '2026-07-01',
        },
      ],
    })
    const changeHandler = vi.fn()
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: '2026-06-01' }],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      kcEvent: {
        classes: ['AVO'],
        endDate: '2026-06-01',
        eventType: 'NOME-B',
        judge: 'Tuomari A',
        judgeId: 1000001,
        location: 'Vantaa',
        startDate: '2026-06-01',
      },
      kcGuid: 'guid-a',
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    const { user } = await renderComponent({ event: testEvent, onChange: changeHandler, open: true })
    await user.click(screen.getByText('event.kcIdSwitch'))
    await flushPromises()

    expect(changeHandler).toHaveBeenCalledTimes(1)
    // The server merges what the form sends the way patchMerge does: only an explicit null deletes a key
    const merged = patchMerge({ ...testEvent }, changeHandler.mock.lastCall?.[0])
    expect(merged.kcGuid).toBe('guid-b')
    expect(merged.kcEvent).toEqual(expect.objectContaining({ classes: ['ALO'] }))
    expect(merged.kcEvent).not.toHaveProperty('judge')
    expect(merged.kcEvent).not.toHaveProperty('judgeId')
    expect(merged.kcEvent).not.toHaveProperty('location')
  })

  it('should say that the event is linked, without showing the GUID', async () => {
    const testEvent: PartialEvent = {
      classes: [],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      kcGuid: 'guid-222',
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    await renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    expect(screen.getByText('event.kcGuidLinked')).toBeInTheDocument()
    expect(screen.queryByText('guid-222')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'event.kcGuid' })).not.toBeInTheDocument()
  })

  it('should show the old koetunnus of an event without a GUID, and offer the lookup', async () => {
    const testEvent: PartialEvent = {
      classes: [],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      kcId: 222,
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    await renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    expect(screen.getByText('event.kcIdLegacy id')).toBeInTheDocument()
    expect(screen.queryByText('event.kcGuidLinked')).not.toBeInTheDocument()
    expect(screen.getByText('event.kcIdLookup')).toBeInTheDocument()
    expect(screen.queryByText('event.kcIdRemove')).not.toBeInTheDocument()
  })

  it('should clear the link, and only the link, when remove is selected', async () => {
    const changeHandler = vi.fn()
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: '2026-06-01' }],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      kcGuid: 'guid-222',
      kcId: 111,
      name: 'Koe',
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    const { rerender, user } = await renderComponent({ event: testEvent, onChange: changeHandler, open: true })

    await user.click(screen.getByText('event.kcIdRemove'))

    expect(changeHandler).toHaveBeenLastCalledWith({ kcEvent: null, kcGuid: null })

    rerender(
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Provider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
          <KcIdSection
            {...{ event: { ...testEvent, kcGuid: null, kcId: undefined }, onChange: changeHandler, open: true }}
          />
        </Provider>
      </LocalizationProvider>
    )

    expect(screen.queryByText('event.kcGuidLinked')).not.toBeInTheDocument()
    expect(screen.getByText('event.kcIdEmpty')).toBeInTheDocument()
  })

  it('should show a not-found message including the search criteria when there are no matches', async () => {
    vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({ choices: [] })
    const testEvent: PartialEvent = {
      classes: [],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    const { user } = await renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    await user.click(screen.getByText('event.kcIdLookup'))
    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcIdNotFound criteria', { variant: 'warning' })
  })

  it('should report Kennel Club event lookup failures', async () => {
    const error = new Error('lookup failed')
    vi.spyOn(eventApi, 'searchEventKcIdChoices').mockRejectedValueOnce(error)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: '2026-06-01' }],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    try {
      const { user } = await renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

      await user.click(screen.getByText('event.kcIdLookup'))
      await flushPromises()

      expect(consoleError).toHaveBeenCalledWith(error)
      expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcIdSearchFailed', { variant: 'error' })
    } finally {
      consoleError.mockRestore()
    }
  })

  describe('drift warnings', () => {
    const kcEvent: KcEventInfo = {
      classes: ['ALO'],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      judge: 'Tuomari Testi',
      location: 'Espoo',
      startDate: '2026-06-01',
    }
    const baseEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: '2026-06-01' }],
      endDate: '2026-06-01',
      eventType: 'NOME-B',
      id: 'test',
      judges: [{ id: 1, name: 'Tuomari Testi' }],
      kcEvent,
      kcGuid: 'guid-222',
      location: 'Espoo',
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: '2026-06-01',
    }

    it('should show no warnings when the event matches the linked Kennel Club event', async () => {
      await renderComponent({ event: baseEvent, onChange: vi.fn(), open: true })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('should show no warnings when a GUID is set without a stored snapshot', async () => {
      await renderComponent({ event: { ...baseEvent, kcEvent: undefined }, onChange: vi.fn(), open: true })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('should warn when the event type differs from the linked Kennel Club event', async () => {
      await renderComponent({ event: { ...baseEvent, eventType: 'NOWT' }, onChange: vi.fn(), open: true })

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('event.kcIdWarningType eventType, kcEventType')).toBeInTheDocument()
    })

    it('should warn when the classes differ from the linked Kennel Club event', async () => {
      await renderComponent({
        event: {
          ...baseEvent,
          classes: [
            { class: 'ALO', date: '2026-06-01' },
            { class: 'AVO', date: '2026-06-01' },
          ],
        },
        onChange: vi.fn(),
        open: true,
      })

      expect(screen.getByText('event.kcIdWarningClasses classes, kcClasses')).toBeInTheDocument()
    })

    it('should warn when the dates differ from the linked Kennel Club event', async () => {
      await renderComponent({
        event: { ...baseEvent, endDate: '2026-06-02' },
        onChange: vi.fn(),
        open: true,
      })

      expect(screen.getByText('event.kcIdWarningDates dates, kcDates')).toBeInTheDocument()
    })

    it('should warn when the location differs from the linked Kennel Club event', async () => {
      await renderComponent({ event: { ...baseEvent, location: 'Vantaa' }, onChange: vi.fn(), open: true })

      expect(screen.getByText('event.kcIdWarningLocation kcLocation, location')).toBeInTheDocument()
    })

    it('should warn when the Kennel Club head judge is not among the event judges', async () => {
      await renderComponent({
        event: { ...baseEvent, judges: [{ id: 1, name: 'Joku Muu' }] },
        onChange: vi.fn(),
        open: true,
      })

      expect(screen.getByText('event.kcIdWarningJudge kcJudge')).toBeInTheDocument()
    })

    it('should not warn about judges when the Kennel Club event has no head judge on record', async () => {
      await renderComponent({
        event: { ...baseEvent, judges: [{ id: 1, name: 'Joku Muu' }], kcEvent: { ...kcEvent, judge: undefined } },
        onChange: vi.fn(),
        open: true,
      })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    describe('by member number', () => {
      const withJudgeId = { ...kcEvent, judgeId: 1000001 }

      it('should match a judge by number, however the names are spelled', async () => {
        await renderComponent({
          event: { ...baseEvent, judges: [{ id: 1000001, name: 'Testi, Tuomari' }], kcEvent: withJudgeId },
          onChange: vi.fn(),
          open: true,
        })

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })

      it('should not match a judge with the same name but another number', async () => {
        await renderComponent({
          event: { ...baseEvent, judges: [{ id: 2, name: 'Tuomari Testi' }], kcEvent: withJudgeId },
          onChange: vi.fn(),
          open: true,
        })

        expect(screen.getByText('event.kcIdWarningJudge kcJudge')).toBeInTheDocument()
      })

      it('should accept any of the event judges', async () => {
        await renderComponent({
          event: {
            ...baseEvent,
            judges: [
              { id: 2, name: 'Joku Muu' },
              { id: 1000001, name: 'Tuomari Testi' },
            ],
            kcEvent: withJudgeId,
          },
          onChange: vi.fn(),
          open: true,
        })

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })

      it('should compare by name a judge that has no number', async () => {
        await renderComponent({
          event: { ...baseEvent, judges: [{ name: ' tuomari TESTI ' }], kcEvent: withJudgeId },
          onChange: vi.fn(),
          open: true,
        })

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })

      it.each([0, undefined])(
        'should not warn when the chief judge number is %s and no name is known',
        async (judgeId) => {
          await renderComponent({
            event: {
              ...baseEvent,
              judges: [{ id: 2, name: 'Joku Muu' }],
              kcEvent: { ...kcEvent, judge: undefined, judgeId },
            },
            onChange: vi.fn(),
            open: true,
          })

          expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        }
      )

      it('should fall back to names for a kcEvent stored before the number was kept', async () => {
        await renderComponent({
          event: { ...baseEvent, judges: [{ id: 2, name: 'Joku Muu' }] },
          onChange: vi.fn(),
          open: true,
        })

        expect(screen.getByText('event.kcIdWarningJudge kcJudge')).toBeInTheDocument()
      })
    })
  })
})
