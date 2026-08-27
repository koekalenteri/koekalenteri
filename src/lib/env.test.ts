import { isDevEnv, isProdEnv, isTestEnv, stackName } from './env'

const testRunnerDefined = () => true
const testRunnerUndefined = () => false

describe('env', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isDevEnv', () => {
    it('returns true when NODE_ENV is development and vi is undefined', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('REACT_APP_API_BASE_URL', '')

      expect(isDevEnv(testRunnerUndefined)).toBe(true)
    })

    it('returns true when REACT_APP_API_BASE_URL ends with /dev and vi is undefined', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('REACT_APP_API_BASE_URL', 'https://api.example.com/dev')

      expect(isDevEnv(testRunnerUndefined)).toBe(true)
    })

    it('returns false when vi is defined, even if NODE_ENV is development', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('REACT_APP_API_BASE_URL', 'https://api.example.com/dev')

      expect(isDevEnv(testRunnerDefined)).toBe(false)
    })

    it('returns false when neither condition is met', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('REACT_APP_API_BASE_URL', 'https://api.example.com/prod')

      expect(isDevEnv(testRunnerUndefined)).toBe(false)
    })
  })

  describe('isTestEnv', () => {
    it('returns true when NODE_ENV is test', () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('REACT_APP_API_BASE_URL', '')

      expect(isTestEnv(testRunnerUndefined)).toBe(true)
    })

    it('returns true when vi is defined', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('REACT_APP_API_BASE_URL', 'https://api.example.com/prod')

      expect(isTestEnv(testRunnerDefined)).toBe(true)
    })

    it('returns false when neither condition is met', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('REACT_APP_API_BASE_URL', '')

      expect(isTestEnv(testRunnerUndefined)).toBe(false)
    })
  })

  describe('isProdEnv', () => {
    it('returns true when NODE_ENV is production', () => {
      vi.stubEnv('NODE_ENV', 'production')

      expect(isProdEnv()).toBe(true)
    })

    it('returns false when NODE_ENV is not production', () => {
      vi.stubEnv('NODE_ENV', 'development')

      expect(isProdEnv()).toBe(false)

      vi.stubEnv('NODE_ENV', 'test')
      expect(isProdEnv()).toBe(false)
    })
  })

  describe('stackName', () => {
    it('returns koekalenteri-dev when in development environment', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('REACT_APP_API_BASE_URL', '')

      expect(stackName(testRunnerUndefined)).toBe('koekalenteri-dev')
    })

    it('returns koekalenteri-dev when API URL ends with /dev', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('REACT_APP_API_BASE_URL', 'https://api.example.com/dev')

      expect(stackName(testRunnerUndefined)).toBe('koekalenteri-dev')
    })

    it('returns koekalenteri-test when in test environment', () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('REACT_APP_API_BASE_URL', '')

      expect(stackName(testRunnerUndefined)).toBe('koekalenteri-test')
    })

    it('returns koekalenteri-test when vi is defined', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('REACT_APP_API_BASE_URL', '')

      expect(stackName(testRunnerDefined)).toBe('koekalenteri-test')
    })

    it('returns koekalenteri-prod when in production environment', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('REACT_APP_API_BASE_URL', '')

      expect(stackName(testRunnerUndefined)).toBe('koekalenteri-prod')
    })
  })
})
