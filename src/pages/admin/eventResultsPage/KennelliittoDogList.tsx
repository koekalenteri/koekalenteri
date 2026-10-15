import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export interface DogLine {
  readonly id: string
  readonly text: string
}

/** Dogs one under another, each line naming the dog and what is to be said of it. */
export const KennelliittoDogList = ({ lines }: { readonly lines: readonly DogLine[] }) => (
  <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
    {lines.map((line) => (
      <Typography component="li" key={line.id} variant="body2">
        {line.text}
      </Typography>
    ))}
  </Stack>
)
