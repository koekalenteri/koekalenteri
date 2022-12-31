import { Suspense } from 'react'
import { render } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { flushPromisesAndTimers } from '../../../test-utils/utils'

import ClassEntrySelection from './ClassEntrySelection'


describe('ClassEntrySelection', () => {
  it.each([
    [undefined],
    [[]],
    [[new Date(2022, 0, 1, 12)]], [[new Date(2022, 5, 20, 12)]],
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
