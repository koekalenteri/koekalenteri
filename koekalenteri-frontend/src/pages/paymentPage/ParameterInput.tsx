interface Props {
  name: string
  value: string
}

export const ParameterInput = ({ name, value }: Props) => <input type="hidden" name={name} value={value} />
