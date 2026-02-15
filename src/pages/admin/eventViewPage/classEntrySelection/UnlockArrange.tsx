import type { Dispatch, SetStateAction } from 'react'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'

interface Props {
  checked?: boolean
  disabled?: boolean
  onChange?: Dispatch<SetStateAction<boolean>>
}

const UnlockArrange = ({ checked, disabled, onChange }: Props) => {
  if (disabled) return null

  return (
    <FormControl sx={{ alignItems: 'center', flexDirection: 'row', maxWidth: 450 }}>
      <FormControlLabel
        control={<Switch checked={checked} size="small" />}
        disableTypography
        label="Järjestä varasijoja, vaikka varasijailmoitukset on jo lähetetty"
        onChange={(_e, checked) => onChange?.(checked)}
        sx={{ fontSize: '0.82rem', lineHeight: 1 }}
      />
      <Tooltip
        title={
          <div>
            <p>
              Jos varasijojen järjestykseen jäi virhe, voit uudelleenjärjestellä varasijoja, vaikka varasijailmoitukset
              on jo lähetetty.
            </p>
            <p>Käytä varoen, koska varasijoille olijoille on jo kerrottu heidän varasijansa. </p>
            <p>Jos haluat, voit lähettää heille uuden varasijailmoituksen, jossa on päivitetty varasijanumero.</p>
          </div>
        }
      >
        <InfoOutlined color="info" fontSize="small" />
      </Tooltip>
    </FormControl>
  )
}

export default UnlockArrange
