import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { Judge } from '../../../../types'
import OfficialCell from '../../components/OfficialCell'
import { createJudgeFlagCell } from './JudgeFlagCell'

const MockTrialSwitch = createJudgeFlagCell('mockTrial')

/**
 * Who judges a Mock trial on their own (KOE-1357): an A-trial judge by right, a NOWT judge when an
 * admin says so. The rest have no say in one, and the cell stays empty.
 */
const MockTrialCell = (props: GridRenderCellParams<Judge, boolean>) => {
  const { eventTypes } = props.row
  if (eventTypes.includes('NOME-A')) return <OfficialCell {...props} value />
  if (eventTypes.includes('NOWT')) return <MockTrialSwitch {...props} />
  return null
}

export default MockTrialCell
