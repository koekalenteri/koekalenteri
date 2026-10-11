// Loaded before any test fakes the clock: TZDate extends the Date it finds at load time, and on a
// fake Date it formats in the host zone (UTC in CI) instead of Europe/Helsinki.
import '@date-fns/tz'
import { guardConsole } from '../test-utils/consoleGuard'

// The lambdas log through console (lib/log.ts). An info or debug line says nothing in a test, so
// those are silenced; an error or a warning is the test's to expect, by spying on the level the
// way the tests that read the lines back already do (KOE-1439).
guardConsole({ mute: ['debug', 'info', 'log'] })
