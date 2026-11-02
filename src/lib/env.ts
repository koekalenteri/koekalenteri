/** Detect whether we're running under a test runner in either node or jsdom. */
const isTestRunnerDefined = (): boolean => 'vi' in globalThis || ('expect' in globalThis && 'describe' in globalThis)

/**
 * The backend stage this frontend was built against, read from the last path segment of the API URL.
 * Anything that is not dev or test counts as prod, so a missing or local URL errs on the side of the
 * production behaviour.
 */
export const apiStage = (): 'dev' | 'test' | 'prod' => {
  const last = process.env.REACT_APP_API_BASE_URL?.split('/').pop()
  return last === 'dev' || last === 'test' ? last : 'prod'
}

export const isDevEnv = (detectTestRunner: () => boolean = isTestRunnerDefined): boolean =>
  (process.env.NODE_ENV === 'development' || apiStage() === 'dev') && !detectTestRunner()

export const isTestEnv = (detectTestRunner: () => boolean = isTestRunnerDefined): boolean =>
  process.env.NODE_ENV === 'test' || detectTestRunner()

export const isProdEnv = (): boolean => process.env.NODE_ENV === 'production'

/**
 * A page title or a mail subject outside prod names the environment, so a dev tab and a test tab
 * are told apart from a prod tab, and a dev mail from a prod mail. The stage goes in front: a narrow
 * tab or a mailbox list shows only the first words. Only dev and test are named; prod and a stage
 * the deployment never gave a name (local) stay as they are.
 */
export const stageTitle = (title: string, stage: string = apiStage()): string =>
  stage === 'dev' || stage === 'test' ? `(${stage}) ${title}` : title

type Stage = 'prod' | 'test' | 'dev'

/**
 * Where an environment may copy an event to (KOE-1471). Never into prod: prod has no import
 * function to receive a copy, and this list is the export's own refusal on top of that.
 */
const COPY_TARGETS: Record<Stage, Stage[]> = {
  dev: ['test'],
  prod: ['test', 'dev'],
  test: ['dev'],
}

export const copyTargets = (stage: string): Stage[] =>
  stage === 'prod' || stage === 'test' || stage === 'dev' ? COPY_TARGETS[stage] : []

export const stackName = (
  detectTestRunner: () => boolean = isTestRunnerDefined
): 'koekalenteri-dev' | 'koekalenteri-test' | 'koekalenteri-prod' => {
  if (isDevEnv(detectTestRunner)) return 'koekalenteri-dev'
  if (isTestEnv(detectTestRunner)) return 'koekalenteri-test'
  return 'koekalenteri-prod'
}
