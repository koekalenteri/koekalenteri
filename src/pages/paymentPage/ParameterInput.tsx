interface Props {
  readonly name: string
  readonly value: string | Date
}

export const ParameterInput = ({ name, value }: Props) => (
  <input type="hidden" name={name} value={typeof value === 'object' ? value.toISOString() : value} />
)
