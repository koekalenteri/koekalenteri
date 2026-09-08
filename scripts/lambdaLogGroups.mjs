// Every lambda needs a log group with a retention, or CloudWatch keeps its logs forever. That was
// six hand-written lines per function in the template, repeated 65 times, and one of them left out
// would have shown up only as a bill. The block is identical apart from the function name, so the
// build generates it; a function that needs something else -- the payment and refund functions keep
// their logs for 180 days -- writes its own, and this leaves it alone.

const DEFAULT_RETENTION_IN_DAYS = 30

const resourcesOfType = (yaml, type) => {
  const names = []
  const pattern = new RegExp(String.raw`^ {2}(\w+):\n {4}Type: ${type}\s*$`, 'gm')
  let match
  while ((match = pattern.exec(yaml)) !== null) names.push(match[1])

  return names
}

/** The `<Function>LogGroup` resources for every function in `yaml` that does not declare one. */
export const generateLogGroups = (yaml, retentionInDays = DEFAULT_RETENTION_IN_DAYS) => {
  const declared = new Set(resourcesOfType(yaml, 'AWS::Logs::LogGroup'))

  return resourcesOfType(yaml, 'AWS::Serverless::Function')
    .filter((name) => !declared.has(`${name}LogGroup`))
    .map(
      (name) => `  ${name}LogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Join ['/', ['/aws/lambda', !Ref ${name}]]
      RetentionInDays: ${retentionInDays}
`
    )
    .join('\n')
}
