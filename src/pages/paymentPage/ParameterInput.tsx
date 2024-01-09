interface Props {
  readonly name: string
  readonly value: string
}

export const ParameterInput = ({ name, value }: Props) => <input type="hidden" name={name} value={value} />
