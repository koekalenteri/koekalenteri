import type { StationTurnItem } from './StationTurnControls'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { APIError } from '../../../api/http'
import { expectConsoleOutput } from '../../../test-utils/consoleGuard'
import AppSnackbarProvider from '../AppSnackbarProvider'
import { StationScoring } from './StationScoring'

const judge = { id: 223, name: 'Tuomari 2' }
const otherJudge = { id: 224, name: 'Tuomari 3' }
const station = { id: '1', judges: [judge], number: 1 }
const group = { date: '2026-09-12' as const, key: 'ALO-AP', time: 'ap' as const }

/** A NOME-B: judged, not scored — the post is the whole trial, and the result is the judge's word. */
const dogs = [
  {
    class: 'ALO' as const,
    dog: { name: 'Ensimmainen' },
    eventType: 'NOME-B',
    group: { ...group, number: 1 },
    handler: { name: 'Ohjaaja 1' },
    id: 'run-1',
  },
  {
    class: 'ALO' as const,
    dog: { name: 'Toinen' },
    eventType: 'NOME-B',
    group: { ...group, number: 2 },
    id: 'run-2',
  },
  {
    class: 'AVO' as const,
    dog: { name: 'Kolmas' },
    eventType: 'NOME-B',
    group: { ...group, key: 'AVO-AP', number: 1 },
    id: 'run-3',
  },
]

const renderScoring = (props: Partial<Parameters<typeof StationScoring>[0]> = {}) => {
  const onSave = vi.fn().mockResolvedValue({ conflicts: [], saved: [{ id: 'run-1' }], unchanged: [] })
  render(
    <AppSnackbarProvider>
      <StationScoring
        eventType="NOME-B"
        onSave={onSave}
        onTurn={async () => {}}
        registrations={dogs}
        station={station}
        turns={[]}
        {...props}
      />
    </AppSnackbarProvider>
  )
  return { onSave }
}

describe('StationScoring', () => {
  // The server keeps what the post does not hold, so the link must not offer to change it (KOE-1615).
  describe('an outcome on the post link', () => {
    const post = { id: 'post-1', judges: [judge], number: 1 }
    const nowtDog = (eventResult: object, exercise = 1, exercisePosts = ['post-1', 'post-2']) => ({
      class: 'ALO' as const,
      dog: { name: 'Toinen' },
      eventResult,
      eventType: 'NOWT',
      group: { ...group, number: 2 },
      id: 'run-1',
      visit: { exercise, exercisePosts, parts: 1 as const },
    })
    const renderAtPost = (registrations: ReturnType<typeof nowtDog>[], ownOutcomeOnly = true) =>
      renderScoring({ eventType: 'NOWT', ownOutcomeOnly, registrations, station: post })
    const outcomeField = () => screen.getByLabelText('results.interruption')

    it.each([
      ["at another post's exercise", { retirement: { cause: 'injury', exercise: 2 } }],
      ['without a place', { retirement: { cause: 'injury' } }],
      ["at an exercise the dog's round no longer has", { retirement: { cause: 'injury', exercise: 9 } }],
    ])('only shows one %s', async (_name, eventResult) => {
      const user = userEvent.setup()
      renderAtPost([nowtDog(eventResult)])

      await user.click(screen.getByRole('button', { name: '2 Toinen' }))

      expect(outcomeField()).toHaveAttribute('aria-disabled', 'true')
    })

    it("leaves a qualitative type's outcome to its one post", async () => {
      const user = userEvent.setup()
      renderScoring({
        ownOutcomeOnly: true,
        registrations: [{ ...dogs[0], eventResult: { retirement: { cause: 'judgeStopped' } } }],
      })

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))

      expect(outcomeField()).not.toHaveAttribute('aria-disabled')
    })

    it("lets the secretary's post view change the same outcome", async () => {
      const user = userEvent.setup()
      renderAtPost([nowtDog({ retirement: { cause: 'injury', exercise: 2 } })], false)

      await user.click(screen.getByRole('button', { name: '2 Toinen' }))

      expect(outcomeField()).not.toHaveAttribute('aria-disabled')
    })

    it.each([0, 1])('lets a post undo its outcome from place %i of a dog it scores twice', async (place) => {
      const posts = ['post-1', 'post-2', 'post-1']
      const eventResult = { retirement: { cause: 'injury', exercise: 3 } }
      const user = userEvent.setup()
      const { onSave } = renderAtPost([nowtDog(eventResult, 1, posts), nowtDog(eventResult, 3, posts)])

      await user.click(screen.getAllByRole('button', { name: /^2 Toinen · / })[place])
      expect(outcomeField()).not.toHaveAttribute('aria-disabled')

      await user.click(outcomeField())
      await user.click(screen.getByRole('option', { name: 'results.notInterrupted' }))
      await user.click(screen.getByRole('button', { name: 'results.save' }))

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          eventResult: expect.objectContaining({ elimination: undefined, retirement: undefined }),
          id: 'run-1',
        })
      )
    })
  })

  describe('a qualitative type', () => {
    it('asks for the result rather than points, since there is nothing to score', async () => {
      const user = userEvent.setup()
      renderScoring()

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))

      expect(screen.getByLabelText('results.column.result')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('asks whether the judge stopped the trial, and nothing else about why it ended', async () => {
      const user = userEvent.setup()
      renderScoring()

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      await user.click(screen.getByLabelText('results.interruption'))

      // Recording the *reason* is KOE-1299 and still switched off, so the format's hylkäävät virheet
      // and the retirements that are not the judge's call stay out of the list.
      const options = within(screen.getByRole('listbox')).getAllByRole('option')
      expect(options.map((option) => option.textContent)).toEqual([
        'results.notInterrupted',
        'results.retirement.judgeStopped',
      ])
    })

    it("saves a judge's stop as the nought, with the mark that says the trial ended early", async () => {
      const user = userEvent.setup()
      const { onSave } = renderScoring()

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      await user.click(screen.getByLabelText('results.interruption'))
      await user.click(screen.getByRole('option', { name: 'results.retirement.judgeStopped' }))

      // The stop is one thing to record, not two: the nought follows from it, and the "Kesk." beside it
      // is what a reader needs to tell the stop from a dog that simply went unplaced.
      expect(screen.getByText('results.marks.interrupted')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'results.save' }))

      expect(onSave).toHaveBeenCalledWith({
        basedOn: undefined,
        eventResult: {
          elimination: undefined,
          judge,
          resultCode: '0',
          retirement: { cause: 'judgeStopped', stationId: '1' },
          tasks: [],
        },
        id: 'run-1',
        stationId: '1',
      })
    })

    it("takes a judge's stop back when a prize is picked over it", async () => {
      const user = userEvent.setup()
      const { onSave } = renderScoring()

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      await user.click(screen.getByLabelText('results.interruption'))
      await user.click(screen.getByRole('option', { name: 'results.retirement.judgeStopped' }))

      // A stop can only stand beside the nought (KOE-1300): the prize says the trial was judged after
      // all, so it goes out with the stop rather than beside it — and the control that recorded the stop
      // is greyed out at a prize, so it could not have taken the stop back itself.
      await user.click(screen.getByLabelText('results.column.result'))
      await user.click(screen.getByRole('option', { name: 'ALO1' }))

      expect(screen.queryByText('results.marks.interrupted')).not.toBeInTheDocument()
      expect(screen.getByLabelText('results.interruption')).toHaveAttribute('aria-disabled', 'true')

      await user.click(screen.getByRole('button', { name: 'results.save' }))

      expect(onSave).toHaveBeenCalledWith({
        basedOn: undefined,
        eventResult: {
          elimination: undefined,
          judge,
          resultCode: '1',
          retirement: undefined,
          tasks: [],
        },
        id: 'run-1',
        stationId: '1',
      })
    })

    it("saves the judge's decision, attributed to the lone judge without asking", async () => {
      const user = userEvent.setup()
      const { onSave } = renderScoring()

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      await user.click(screen.getByLabelText('results.column.result'))
      await user.click(within(screen.getByRole('listbox')).getByText('ALO1'))
      await user.click(screen.getByRole('button', { name: 'results.save' }))

      expect(onSave).toHaveBeenCalledWith({
        basedOn: undefined,
        eventResult: { judge, resultCode: '1', tasks: [] },
        id: 'run-1',
        stationId: '1',
      })
    })

    it('offers the choice where the post has more than one judge', async () => {
      const user = userEvent.setup()
      const { onSave } = renderScoring({ station: { ...station, judges: [judge, otherJudge] } })

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      await user.click(screen.getByLabelText('results.judge'))
      await user.click(within(screen.getByRole('listbox')).getByText('Tuomari 3'))
      await user.click(screen.getByLabelText('results.column.result'))
      await user.click(within(screen.getByRole('listbox')).getByText('ALO0'))
      await user.click(screen.getByRole('button', { name: 'results.save' }))

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ eventResult: { judge: otherJudge, resultCode: '0', tasks: [] } })
      )
    })

    it('starts a correction from what is recorded, and marks a judged dog as done', async () => {
      const user = userEvent.setup()
      const updatedAt = new Date('2026-09-12T10:00:00Z')
      const judged = { ...dogs[0], eventResult: { judge, result: 'ALO2', updatedAt } }
      const { onSave } = renderScoring({ registrations: [judged, dogs[1]] })

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      // A correction is based on the stored result's version, the whole result being the post's.
      await user.click(screen.getByLabelText('results.column.result'))
      await user.click(within(screen.getByRole('listbox')).getByText('ALO1'))
      await user.click(screen.getByRole('button', { name: 'results.save' }))
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ basedOn: updatedAt, id: 'run-1' }))

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))

      expect(screen.getByLabelText('results.column.result')).toHaveTextContent('ALO2')
      // A judged dog's day at the post is over: it cannot be sent out again.
      expect(screen.getByRole('button', { name: 'liveStatus.startTurn' })).toBeDisabled()
      // A filled chip is a dog that has been through; an outlined one is still to come.
      expect(screen.getByRole('button', { name: '1 Ensimmainen' })).toHaveClass('MuiChip-filled')
      expect(screen.getByRole('button', { name: '2 Toinen' })).toHaveClass('MuiChip-outlined')
    })

    it('shows a NOME-A result as Kennelliitto lists it, without the format in front (KOE-1592)', async () => {
      const user = userEvent.setup()
      const kp = { date: '2026-09-12' as const, key: '2026-09-12-kp', time: 'kp' as const }
      const nomeA = [
        {
          dog: { name: 'Ensimmainen' },
          eventResult: { judge, result: 'NOME-A1', updatedAt: new Date('2026-09-12T10:00:00Z') },
          eventType: 'NOME-A',
          group: { ...kp, number: 1 },
          id: 'run-1',
        },
        { dog: { name: 'Toinen' }, eventType: 'NOME-A', group: { ...kp, number: 2 }, id: 'run-2' },
      ]
      renderScoring({ eventType: 'NOME-A', registrations: nomeA })

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))

      const result = screen.getByLabelText('results.column.result')
      expect(result).toHaveTextContent('A1')
      expect(result).not.toHaveTextContent('NOME-A1')

      await user.click(result)
      expect(
        within(screen.getByRole('listbox'))
          .getAllByRole('option')
          .map((option) => option.textContent)
      ).toEqual(['results.resultNone', 'A1', 'A2', 'A3', 'A0', 'A-'])
    })
  })

  describe('coming back to a turn already started', () => {
    const running: StationTurnItem = {
      dogs: [{ name: 'Kolmas', number: 1 }],
      startedAt: new Date('2026-09-12T08:00:00Z'),
      stationId: '1',
    }

    it('opens on the dog at the post, class tab and all', () => {
      renderScoring({ turns: [running] })

      // The dog at the post is in the other class: the tab follows the dog, not the other way round.
      expect(screen.getByRole('tab', { name: 'AVO', selected: true })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '1. Kolmas' })).toBeInTheDocument()
    })

    it('opens on an empty screen over a break, which holds no dog', () => {
      renderScoring({ turns: [{ ...running, dogs: [], pause: 'coffee' }] })

      expect(screen.getByRole('tab', { name: 'ALO', selected: true })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /Kolmas/ })).not.toBeInTheDocument()
    })
  })

  it('lists the class tabs as ALO, AVO, VOI and opens on ALO, whatever order the dogs come in (KOE-1596)', () => {
    const voi = { ...dogs[2], class: 'VOI' as const, group: { ...group, key: 'VOI-AP', number: 1 }, id: 'run-4' }
    renderScoring({ registrations: [voi, dogs[2], dogs[0]] })

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['ALO', 'AVO', 'VOI'])
    expect(screen.getByRole('tab', { name: 'ALO', selected: true })).toBeInTheDocument()
  })

  describe('a post in a running order (KOE-1665)', () => {
    const nowt = (id: string, eventClass: 'ALO' | 'VOI', exercise: number, parts: 1 | 2 = 1) => ({
      class: eventClass,
      dog: { name: id },
      eventType: 'NOWT',
      group: { ...group, key: `${eventClass}-AP`, number: 1 },
      id,
      visit: { exercise, exercisePosts: ['post-0', '1', '1', '1'], parts },
    })

    it('keeps the classes in the order they reach the post', () => {
      renderScoring({ eventType: 'NOWT', registrations: [nowt('voi', 'VOI', 1), nowt('alo', 'ALO', 2)] })

      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['VOI', 'ALO'])
    })

    it('scores the exercise of the place in the queue, its parts each a field', async () => {
      const user = userEvent.setup()
      renderScoring({ eventType: 'NOWT', registrations: [nowt('alo', 'ALO', 2, 2)] })

      await user.click(screen.getByRole('button', { name: '1 alo' }))

      expect(screen.getAllByLabelText(/results\.column\.taskPart/)).toHaveLength(2)
    })

    it('lists a dog doing two exercises here once for each, and marks the one scored', async () => {
      const user = userEvent.setup()
      const scored = {
        ...nowt('alo', 'ALO', 3),
        eventResult: { tasks: [{ exercise: 3, part: 0, points: 15, updatedAt: new Date(), updatedBy: 'x' }] },
      }
      const second = { ...nowt('alo', 'ALO', 4, 1), eventResult: scored.eventResult }
      renderScoring({ eventType: 'NOWT', registrations: [scored, second] })

      const chips = screen.getAllByRole('button', { name: /^1 alo · results\.column\.task/ })
      expect(chips).toHaveLength(2)
      expect(chips.map((chip) => chip.className.includes('MuiChip-filled'))).toEqual([true, false])

      await user.click(chips[1])
      expect(screen.getAllByLabelText(/results\.column\.task/)).toHaveLength(1)
    })

    it('marks done only the place of the exercise the round ended at, a post come to twice (KOE-1669)', () => {
      const ended = {
        eventResult: {
          retirement: { cause: 'handlerChoice' as const, exercise: 3 },
          updatedAt: new Date(),
        },
      }
      const order = ['1', 'post-1', '1']
      const place = (exercise: number) => ({
        ...nowt('alo', 'ALO', exercise, 1),
        ...ended,
        visit: { exercise, exercisePosts: order, parts: 1 as const },
      })
      renderScoring({ eventType: 'NOWT', registrations: [place(1), place(3)] })

      const chips = screen.getAllByRole('button', { name: /^1 alo · results\.column\.task/ })
      expect(chips.map((chip) => chip.className.includes('MuiChip-filled'))).toEqual([false, true])
    })
  })

  describe('a dog whose round ended at an earlier post (KOE-1669)', () => {
    const at = new Date('2026-09-12T09:00:00Z')
    /** A dog at exercise 3, the post's one; `retiredAt` is the exercise its round ended at. */
    const dog = (id: string, number: number, retiredAt?: number) => ({
      class: 'ALO' as const,
      dog: { name: id },
      eventType: 'NOWT',
      group: { ...group, number },
      id,
      visit: { exercise: 3, exercisePosts: ['post-0', 'post-x', '1'], parts: 2 as const },
      ...(retiredAt
        ? {
            eventResult: {
              retirement: { cause: 'handlerChoice' as const, exercise: retiredAt },
              updatedAt: at,
            },
          }
        : {}),
    })

    it('shows kesk instead of the inputs and counts the dog as done', async () => {
      const user = userEvent.setup()
      renderScoring({ eventType: 'NOWT', registrations: [dog('stopped', 1, 1)] })

      expect(screen.getByRole('button', { name: '1 stopped' })).toHaveClass('MuiChip-filled')
      await user.click(screen.getByRole('button', { name: '1 stopped' }))

      expect(screen.getAllByText(/results\.notReached/)).toHaveLength(2)
      expect(screen.queryByLabelText(/results\.column\.task/)).not.toBeInTheDocument()
    })

    it('asks for the scores of a dog whose round ended here or at an unknown post', async () => {
      const user = userEvent.setup()
      renderScoring({
        eventType: 'NOWT',
        registrations: [
          dog('here', 1, 3),
          { ...dog('unknown', 2), eventResult: { retirement: { cause: 'injury' as const }, updatedAt: at } },
        ],
      })

      await user.click(screen.getByRole('button', { name: '1 here' }))
      expect(screen.getAllByLabelText(/results\.column\.task/)).toHaveLength(2)
      await user.click(screen.getByRole('button', { name: '2 unknown' }))
      expect(screen.getAllByLabelText(/results\.column\.task/)).toHaveLength(2)
      expect(screen.queryByText(/results\.notReached/)).not.toBeInTheDocument()
    })

    it('moves on past it to the next dog the post has to score', async () => {
      const user = userEvent.setup()
      renderScoring({
        eventType: 'NOWT',
        registrations: [dog('first', 1), dog('stopped', 2, 1), dog('third', 3)],
      })

      await user.click(screen.getByRole('button', { name: '1 first' }))
      await user.type(screen.getAllByLabelText(/results\.column\.task/)[0], '15')
      await user.click(screen.getByRole('button', { name: 'results.save' }))

      expect(await screen.findByRole('heading', { name: '3. third' })).toBeInTheDocument()
    })

    it('counts a dog whose round ended at this very post as done, its outcome recorded here', () => {
      renderScoring({ eventType: 'NOWT', registrations: [dog('here', 1, 3)] })

      expect(screen.getByRole('button', { name: '1 here' })).toHaveClass('MuiChip-filled')
    })

    it('asks for the scores of a dog whose round ended at a post after this one, and does not count it done', async () => {
      const user = userEvent.setup()
      renderScoring({ eventType: 'NOWT', registrations: [dog('later', 1, 5)] })

      expect(screen.getByRole('button', { name: '1 later' })).toHaveClass('MuiChip-outlined')
      await user.click(screen.getByRole('button', { name: '1 later' }))
      expect(screen.getAllByLabelText(/results\.column\.task/)).toHaveLength(2)
      expect(screen.queryByText(/results\.notReached/)).not.toBeInTheDocument()
    })

    it('keeps a score stored here after the stop as an input, since it counts and may need clearing', async () => {
      const user = userEvent.setup()
      const stray = { exercise: 3, judge, part: 0, points: 7, updatedAt: at, updatedBy: 'Rasti 1' }
      const stopped = dog('stopped', 1, 1)
      renderScoring({
        eventType: 'NOWT',
        registrations: [{ ...stopped, eventResult: { ...stopped.eventResult, tasks: [stray] } }],
      })

      await user.click(screen.getByRole('button', { name: '1 stopped' }))

      expect(screen.getByLabelText(/results\.column\.task/)).toHaveValue('7')
      expect(screen.getAllByText(/results\.notReached/)).toHaveLength(1)
    })
  })

  describe('the outcome a post asks for (KOE-1669)', () => {
    const one = (eventType: string) => ({
      class: 'ALO' as const,
      dog: { name: 'Koira' },
      eventType,
      group: { ...group, number: 1 },
      id: 'run-1',
      ...(eventType === 'NOWT' ? { visit: { exercise: 1, exercisePosts: ['1'], parts: 1 as const } } : {}),
    })

    it.each([
      [
        'NOWT',
        [
          'results.notInterrupted',
          'results.retirement.handlerChoice',
          'results.retirement.injury',
          'results.retirement.illness',
          'results.retirement.judgeStopped',
        ],
      ],
      ['NOME-A', ['results.notInterrupted', 'results.retirement.judgeStopped']],
    ])('offers %s its own ways for a round to end', async (eventType, expected) => {
      const user = userEvent.setup()
      renderScoring({ eventType, registrations: [one(eventType)] })

      await user.click(screen.getByRole('button', { name: '1 Koira' }))
      await user.click(screen.getByLabelText('results.interruption'))

      const options = within(screen.getByRole('listbox')).getAllByRole('option')
      expect(options.map((option) => option.textContent)).toEqual(expected)
    })
  })

  describe('a save that is refused (KOE-1140)', () => {
    const pickAndSave = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      await user.click(screen.getByLabelText('results.column.result'))
      await user.click(screen.getByRole('option', { name: 'ALO1' }))
      await user.click(screen.getByRole('button', { name: 'results.save' }))
    }

    it.each([404, 422])(
      'keeps the dog and its scores, says so, and has the caller read the list when the dog is gone (%i)',
      async (status) => {
        const user = userEvent.setup()
        const onRefused = vi.fn()
        const { onSave } = renderScoring({ onRefused })
        onSave.mockRejectedValueOnce(new APIError(new Response(null, { status }), 'did not run'))
        expectConsoleOutput(new RegExp(`reportError .*${status}`))

        await pickAndSave(user)

        expect(await screen.findByText('results.saveFailed')).toBeInTheDocument()
        expect(onRefused).toHaveBeenCalledTimes(1)
        expect(screen.getByLabelText('results.column.result')).toHaveTextContent('ALO1')
        // Another dog can be picked and saved: the refusal of one is not the end of the post.
        await user.click(screen.getByRole('button', { name: '2 Toinen' }))
        expect(screen.getByRole('button', { name: 'results.save' })).toBeEnabled()
      }
    )

    it('does not read the list for a failure that says nothing of the dog', async () => {
      const user = userEvent.setup()
      const onRefused = vi.fn()
      const { onSave } = renderScoring({ onRefused })
      onSave.mockRejectedValueOnce(new Error('Network Error'))
      expectConsoleOutput(/reportError .*Network Error/)

      await pickAndSave(user)

      expect(await screen.findByText('results.saveFailed')).toBeInTheDocument()
      expect(onRefused).not.toHaveBeenCalled()
    })
  })

  describe('a trial handed to the chief judge (KOE-1140)', () => {
    it('says so and cannot be saved', async () => {
      const user = userEvent.setup()
      renderScoring({ locked: true })

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))

      expect(screen.getByText('results.kennelliitto.lockedSave')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
    })

    it('tells the caller, and says so, when a save finds the trial locked after all', async () => {
      const user = userEvent.setup()
      const onLocked = vi.fn()
      const { onSave } = renderScoring({ onLocked })
      onSave.mockRejectedValueOnce(new APIError(new Response(null, { status: 423 }), { error: 'resultsLocked' }))

      await user.click(screen.getByRole('button', { name: '1 Ensimmainen' }))
      await user.click(screen.getByLabelText('results.column.result'))
      await user.click(screen.getByRole('option', { name: 'ALO1' }))
      await user.click(screen.getByRole('button', { name: 'results.save' }))

      expect(onLocked).toHaveBeenCalledTimes(1)
      expect(await screen.findByText('results.kennelliitto.lockedSave')).toBeInTheDocument()
    })
  })
})
