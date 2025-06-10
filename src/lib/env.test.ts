import { isDevEnv, isProdEnv, isTestEnv, stackName } from './env'
import * as envHelpers from './envHelpers'

describe('env', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('isDevEnv', () => {
    it('returns true when NODE_ENV is development and jest is undefined', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'development')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', '')

      expect(isDevEnv()).toBe(true)
    })

    it('returns true when REACT_APP_API_BASE_URL ends with /dev and jest is undefined', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', 'https://api.example.com/dev')

      expect(isDevEnv()).toBe(true)
    })

    it('returns false when jest is defined, even if NODE_ENV is development', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(true)
      jest.replaceProperty(process.env, 'NODE_ENV', 'development')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', 'https://api.example.com/dev')

      expect(isDevEnv()).toBe(false)
    })

    it('returns false when neither condition is met', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', 'https://api.example.com/prod')

      expect(isDevEnv()).toBe(false)
    })
  })

  describe('isTestEnv', () => {
    it('returns true when NODE_ENV is test', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'test')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', '')

      expect(isTestEnv()).toBe(true)
    })

    it('returns true when jest is defined', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(true)
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', 'https://api.example.com/prod')

      expect(isTestEnv()).toBe(true)
    })

    it('returns false when neither condition is met', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', '')

      expect(isTestEnv()).toBe(false)
    })
  })

  describe('isProdEnv', () => {
    it('returns true when NODE_ENV is production', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')

      expect(isProdEnv()).toBe(true)
    })

    it('returns false when NODE_ENV is not production', () => {
      jest.replaceProperty(process.env, 'NODE_ENV', 'development')

      expect(isProdEnv()).toBe(false)

      jest.replaceProperty(process.env, 'NODE_ENV', 'test')
      expect(isProdEnv()).toBe(false)
    })
  })

  describe('stackName', () => {
    it('returns koekalenteri-dev when in development environment', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'development')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', '')

      expect(stackName()).toBe('koekalenteri-dev')
    })

    it('returns koekalenteri-dev when API URL ends with /dev', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', 'https://api.example.com/dev')

      expect(stackName()).toBe('koekalenteri-dev')
    })

    it('returns koekalenteri-test when in test environment', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'test')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', '')

      expect(stackName()).toBe('koekalenteri-test')
    })

    it('returns koekalenteri-test when jest is defined', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(true)
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', '')

      expect(stackName()).toBe('koekalenteri-test')
    })

    it('returns koekalenteri-prod when in production environment', () => {
      jest.spyOn(envHelpers, 'isJestDefined').mockReturnValue(false)
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')
      jest.replaceProperty(process.env, 'REACT_APP_API_BASE_URL', '')

      expect(stackName()).toBe('koekalenteri-prod')
    })
  })
})
