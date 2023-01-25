import { render, screen } from '@testing-library/react'
import { Headquarters } from 'koekalenteri-shared/model'

import { renderWithUserEvents } from '../../../../test-utils/utils'

import HeadquartersSection from './HeadquartersSection'

const testRenderHQ: Headquarters = {
  name: 'HQ',
  address: 'HQ Address',
  zipCode: '123456',
  postalDistrict: 'HQ Postal District',
}

describe('HeadquartersSection', () => {

  it('should render open', () => {
    const changeHandler = jest.fn()
    const { container } = render(<HeadquartersSection headquarters={testRenderHQ} onChange={changeHandler} open />)
    expect(container).toMatchSnapshot()
  })

  it('should render collapsed', () => {
    const changeHandler = jest.fn()
    const { container } = render(<HeadquartersSection headquarters={testRenderHQ} onChange={changeHandler} open={false} />)
    expect(container).toMatchSnapshot()
  })

  it('should fire onChange', async () => {
    const testHQ: Partial<Headquarters> = {}

    const changeHandler = jest.fn((props) => {
      Object.assign(testHQ, props.headquarters)
    })

    const { user } = renderWithUserEvents(<HeadquartersSection headquarters={testHQ} onChange={changeHandler} open />)

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const nameInput = screen.getByRole('textbox', { name: 'event.headquarters.name' })
    const addressInput = screen.getByRole('textbox', { name: 'event.headquarters.address' })
    const zipInput = screen.getByRole('textbox', { name: 'event.headquarters.zipCode' })
    const districtInput = screen.getByRole('textbox', { name: 'event.headquarters.postalDistrict' })
    expect(nameInput).toHaveValue('')
    expect(addressInput).toHaveValue('')
    expect(zipInput).toHaveValue('')
    expect(districtInput).toHaveValue('')

    await user.type(nameInput, 'Test Name')
    expect(nameInput).toHaveValue('Test Name')
    expect(changeHandler).toHaveBeenCalledTimes(9)
    expect(changeHandler).toHaveBeenLastCalledWith({ headquarters: { name: 'Test Name' } })

    await user.type(addressInput, 'Test Address')
    expect(addressInput).toHaveValue('Test Address')
    expect(changeHandler).toHaveBeenCalledTimes(21)
    expect(changeHandler).toHaveBeenLastCalledWith({ headquarters: { address: 'Test Address' } })

    await user.type(zipInput, '012345')
    expect(zipInput).toHaveValue('012345')
    expect(changeHandler).toHaveBeenCalledTimes(27)
    expect(changeHandler).toHaveBeenLastCalledWith({ headquarters: { zipCode: '012345' } })

    await user.type(districtInput, 'Jyväskylä')
    expect(districtInput).toHaveValue('Jyväskylä')
    expect(changeHandler).toHaveBeenCalledTimes(36)
    expect(changeHandler).toHaveBeenLastCalledWith({ headquarters: { postalDistrict: 'Jyväskylä' } })

  })
})
