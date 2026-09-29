import { FAKES_URL } from '../env.mjs'

interface SentMessage {
  from: string
  template: string
  templateData: Record<string, unknown>
  to: string[]
}

/** The messages the lambdas asked SES to send to `address` so far. */
export const sentTo = async (address: string): Promise<SentMessage[]> => {
  const sent: SentMessage[] = await (await fetch(`${FAKES_URL}/_sent`)).json()
  return sent.filter((message) => message.to.includes(address))
}
