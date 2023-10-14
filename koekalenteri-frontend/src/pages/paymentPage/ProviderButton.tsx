import type { Provider } from 'koekalenteri-shared/model'

import { ParameterInput } from './ParameterInput'

import './ProviderButton.css'

interface Props {
  readonly provider: Provider
}

export const ProviderButton = ({ provider }: Props) => {
  return (
    <form method="POST" action={provider.url}>
      {provider.parameters.map(({ name, value }) => (
        <ParameterInput key={provider.id + name} name={name} value={value} />
      ))}
      <button className="provider-button">
        <img src={provider.svg} alt={provider.name} />
      </button>
    </form>
  )
}
