import { Globals } from '@react-spring/web'

// MUI charts grow their bars and draw their lines with react-spring, so a screenshot taken
// before the springs settle catches a half-drawn chart -- which looks like a layout bug and
// is not one. Turning animation off globally makes every capture deterministic.
//
// Test-only on purpose: the app keeps its animation.
Globals.assign({ skipAnimation: true })
