import { Suspense } from 'react'
import { render } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { flushPromisesAndTimers } from '../../../test-utils/utils'

import ClassEntrySelection from './ClassEntrySelection'

jest.useFakeTimers()

describe('ClassEntrySelection', () => {
  it.each([
    [undefined],
    [[]],
    [[new Date('2022-01-01T10:00:00.000Z')]], [[new Date('2022-06-20T09:00:00.000Z')]],
  ])('given %p as dates', async (dates) => {
    const { container } = render(
      <RecoilRoot>
        <Suspense fallback={<div>loading...</div>} >
          <ClassEntrySelection eventDates={dates} />
        </Suspense>
      </RecoilRoot>,
    )
    await flushPromisesAndTimers()
    expect(container).toMatchSnapshot()
  })
})
