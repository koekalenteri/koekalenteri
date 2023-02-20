import { Grid, TextField } from '@mui/material'

type TitlesAndNameProps = {
  className?: string;
  disabledName: boolean;
  disabledTitle: boolean;
  id: string;
  name?: string;
  nameLabel: string;
  onChange: (props: { titles?: string; name?: string; }) => void;
  regNo?: string;
  titles?: string;
  titlesLabel: string;
};
export function TitlesAndName(props: TitlesAndNameProps) {

  return (
    <Grid item container spacing={1}>
      <Grid item>
        <TextField
          className={props.className}
          disabled={props.disabledTitle}
          id={`${props.id}_titles`}
          label={props.titlesLabel}
          onChange={(e) => props.onChange({ name: props.name, titles: e.target.value.toLocaleUpperCase() })}
          sx={{ width: 300 }}
          value={props.titles || ''} />
      </Grid>
      <Grid item>
        <TextField
          className={props.className}
          disabled={props.disabledName}
          error={!props.disabledName && !props.name}
          id={`${props.id}_name`}
          label={props.nameLabel}
          onChange={(e) => props.onChange({ name: e.target.value.toLocaleUpperCase(), titles: props.titles })}
          sx={{ width: 450 }}
          value={props.name || ''} />
      </Grid>
    </Grid>
  )
}
