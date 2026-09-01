import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { useTranslation } from 'react-i18next'

interface Props {
  reserve: boolean
}

const HeaderRow = ({ reserve }: Props) => {
  const { t } = useTranslation()

  return (
    <TableRow selected>
      <TableCell>#</TableCell>
      <TableCell>{t('dog.regNo')}</TableCell>
      <TableCell>{t('dog.dob')}</TableCell>
      <TableCell>{t('dog.rfid')}</TableCell>
      <TableCell>{t('dog.breed')}</TableCell>
      <TableCell>{t('dog.name')}</TableCell>
      <TableCell>{t('startListExport.owner')}</TableCell>
      <TableCell>{t('startList.ownerIsMember')}</TableCell>
      <TableCell>{t('startListExport.handler')}</TableCell>
      <TableCell>{t('startList.handlerIsMember')}</TableCell>
      <TableCell>{t('startList.handlerPhone')}</TableCell>
      {reserve ? (
        <>
          <TableCell>{t('contact.city')}</TableCell>
          <TableCell>{t('startList.reserveNotice')}</TableCell>
        </>
      ) : null}
    </TableRow>
  )
}

export default HeaderRow
