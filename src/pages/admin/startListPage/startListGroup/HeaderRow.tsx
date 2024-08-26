import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'

interface Props {
  reserve: boolean
}

const HeaderRow = ({ reserve }: Props) => {
  return (
    <TableRow selected>
      <TableCell>#</TableCell>
      <TableCell>Rotu</TableCell>
      <TableCell>Nimi</TableCell>
      <TableCell>Rekisterinumero</TableCell>
      <TableCell>Syntymäaika</TableCell>
      <TableCell>Siru</TableCell>
      <TableCell>Ohjaaja</TableCell>
      <TableCell>Puhelin</TableCell>
      {reserve ? (
        <>
          <TableCell>Paikkakunta</TableCell>
          <TableCell>Varoitusaika</TableCell>
        </>
      ) : null}
    </TableRow>
  )
}

export default HeaderRow
