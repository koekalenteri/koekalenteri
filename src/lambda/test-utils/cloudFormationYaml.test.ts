import { parseTaggedTemplate, parseTemplate, resolveIntrinsics } from './cloudFormationYaml'

const text = `
Name: !Join ['-', [table, !Ref AWS::StackName]]
Arn: !GetAtt Role.Arn
Path: !Sub '/aws/\${Stage}/\${Api}'
Pair: !Sub ['\${A}-\${AWS::StackName}', { A: !Ref Other }]
`

const refs: Record<string, string> = {
  Api: 'abc',
  'AWS::StackName': 'stack',
  Other: 'other',
  'Role.Arn': 'arn:role',
  Stage: 'dev',
}

describe('parseTemplate', () => {
  it('keeps a scalar tag and flattens a list one', () => {
    expect(parseTemplate(text)).toMatchObject({
      Arn: { GetAtt: 'Role.Arn' },
      Name: ['-', ['table', { Ref: 'AWS::StackName' }]],
    })
  })
})

describe('resolveIntrinsics', () => {
  it('resolves Join, GetAtt and both forms of Sub', () => {
    expect(resolveIntrinsics(parseTaggedTemplate(text), (name) => refs[name])).toEqual({
      Arn: 'arn:role',
      Name: 'table-stack',
      Pair: 'other-stack',
      Path: '/aws/dev/abc',
    })
  })

  it('throws on a name it cannot resolve', () => {
    expect(() => resolveIntrinsics(parseTaggedTemplate('A: !Ref Unknown'), () => undefined)).toThrow(/Unknown/)
    expect(() => resolveIntrinsics(parseTaggedTemplate(`A: !Sub '\${Unknown}'`), () => undefined)).toThrow(/Unknown/)
  })

  it('throws on an intrinsic it does not handle', () => {
    expect(() => resolveIntrinsics(parseTaggedTemplate('A: !If [C, x, y]'), () => 'x')).toThrow(/If/)
  })

  it('throws on a template that is not a map', () => {
    expect(() => parseTaggedTemplate('- a')).toThrow()
  })
})
