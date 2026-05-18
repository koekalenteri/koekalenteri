import type { Organizer } from '../../types'
import { LambdaError } from '../lib/lambda'
import { organizerRepository } from './repository'

interface OrganizerReadPort {
  getById(id: string): Promise<Organizer | undefined>
  getWithMerchantId(id: string): Promise<Organizer>
}

const createOrganizerReadPort = (): OrganizerReadPort => ({
  async getById(id) {
    return organizerRepository.getById(id)
  },
  async getWithMerchantId(id) {
    const organizer = await organizerRepository.getById(id)
    if (!organizer?.paytrailMerchantId) {
      throw new LambdaError(412, `Organizer ${id} does not have MerchantId!`)
    }
    return organizer
  },
})

export const organizerReadPort = createOrganizerReadPort()
