import { vi } from 'vitest'

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { read: vi.fn(), update: vi.fn() }
  }),
}))

const { stationScopedSubmission } = await import('./eventResults')

describe('eventResults', () => {
  describe('stationScopedSubmission', () => {
    const judge = { id: 123, name: 'Tuomari' }
    const submission = {
      basedOn: 'v1',
      eventResult: {
        cert: true,
        elimination: { fault: 'hardMouth' as const },
        judge,
        notes: 'not the link to say',
        resultCode: '1' as const,
        tasks: [{ index: 0, points: 17, stationId: 'post-1' }],
      },
      id: 'run-1',
      stationId: 'claimed-elsewhere',
    }

    it("forces the path's post and keeps only what a post may record of a scored round", () => {
      expect(stationScopedSubmission(submission, 'post-1', 'NOWT')).toEqual({
        basedOn: 'v1',
        eventResult: {
          elimination: { fault: 'hardMouth' },
          tasks: [{ index: 0, points: 17, stationId: 'post-1' }],
        },
        id: 'run-1',
        stationId: 'post-1',
      })
    })

    it("lets a qualitative type's verdict and judge through, since its post is the whole trial", () => {
      expect(stationScopedSubmission(submission, '1', 'NOME-B').eventResult).toEqual({
        elimination: { fault: 'hardMouth' },
        judge,
        resultCode: '1',
        tasks: [{ index: 0, points: 17, stationId: 'post-1' }],
      })
    })
  })
})
