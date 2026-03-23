import type { Provider } from '../../types'
import { useState } from 'react'
import { ParameterInput } from './ParameterInput'

import './ProviderButton.css'

interface Props {
  readonly provider: Provider
}

export const ProviderButton = ({ provider }: Props) => {
  const [submitting, setSubmitting] = useState(false)

  return (
    <form method="POST" action={provider.url} onSubmit={() => setSubmitting(true)}>
      {provider.parameters.map(({ name, value }) => (
        <ParameterInput key={provider.id + name} name={name} value={value} />
      ))}
      <button type="submit" className="provider-button" disabled={submitting} aria-busy={submitting}>
        <img src={provider.svg} alt={provider.name} />
      </button>
    </form>
  )
}
