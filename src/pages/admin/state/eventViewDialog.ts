import type { EmailTemplateId, Registration } from '@/types'
import { atom, useSetAtom } from 'jotai'

/** The dialog the event page has open, with what it was opened for. */
export type EventViewDialog =
  | { kind: 'cancel' }
  | { kind: 'create' }
  | { kind: 'details' }
  | { kind: 'edit' }
  | { kind: 'message'; recipients: Registration[]; templateId?: EmailTemplateId }
  | { kind: 'recipients' }
  | { kind: 'refund' }

/**
 * Which of the event page's dialogs is open. The page renders the dialogs; the actions that open
 * them sit three components down in the entry lists and the info panel, and used to reach the page
 * through a setter passed at every level. Now they set this (KOE-1347).
 */
export const adminEventViewDialogAtom = atom<EventViewDialog | undefined>(undefined)

/** Opens one of the event page's dialogs from wherever the action is. */
export const useOpenEventViewDialog = () => useSetAtom(adminEventViewDialogAtom)
