import { atom } from 'jotai'
import { adminJudgesRemoteAtom } from './remoteAtoms'

export const adminJudgesAtom = adminJudgesRemoteAtom
export const adminJudgeFilterAtom = atom('')
