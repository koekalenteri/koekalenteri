import { CheckBoxOutlineBlankOutlined, CheckBoxOutlined } from '@mui/icons-material'
import { GridRenderCellParams } from '@mui/x-data-grid'
import { EventType } from 'koekalenteri-shared/model'

const OfficialCell = (props: GridRenderCellParams<boolean, EventType>) => {
  return props.value ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />
}

export default OfficialCell
