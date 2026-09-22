import { guardConsole } from '../test-utils/consoleGuard'

// The lambdas log through console (lib/log.ts). An info or debug line says nothing in a test, so
// those are silenced; an error or a warning is the test's to expect, by spying on the level the
// way the tests that read the lines back already do (KOE-1439).
guardConsole({ mute: ['debug', 'info', 'log'] })
