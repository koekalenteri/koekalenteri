import CheckBoxOutlineBlankOutlined from '@mui/icons-material/CheckBoxOutlineBlankOutlined'
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined'
import { GridRenderCellParams } from '@mui/x-data-grid'
import { EventType } from 'koekalenteri-shared/model'

const OfficialCell = (props: GridRenderCellParams<EventType, boolean>) => {
  return props.value ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />
}

export default OfficialCell
