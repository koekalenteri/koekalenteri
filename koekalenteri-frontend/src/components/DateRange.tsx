import { DatePicker } from "@mui/lab";
import { Box, FormControl, TextField } from "@mui/material";

type DateValue = Date | null;

export type DateRangeProps = {
  start: DateValue,
  startLabel: string,
  end: DateValue
  endLabel: string,
  onChange?: (start: DateValue, end: DateValue) => void
};

const inputFormat = 'dd.MM.yyyy';

export function DateRange({ start, end, startLabel, endLabel, onChange }: DateRangeProps) {
  let _start = start;
  let _end = end;
  const startChanged = (date: DateValue) => {
    _start = date;
    onChange && onChange(_start, _end);
  };
  const endChanged = (date: DateValue) => {
    _end = date;
    onChange && onChange(_start, _end);
  };

  return (
    <Box sx={{width: '100%'}}>
      <FormControl sx={{pr: 0.5, width: '50%'}}>
        <DatePicker
          label={startLabel}
          value={start}
          mask={'__.__.____'}
          inputFormat={inputFormat}
          maxDate={end ? end : undefined}
          clearable={true}
          showToolbar={false}
          onChange={startChanged}
          renderInput={(params) => <TextField {...params} />}
        />
      </FormControl>

      <FormControl sx={{pl: 0.5, width: '50%'}}>
        <DatePicker
          label={endLabel}
          value={end}
          mask={'__.__.____'}
          inputFormat={inputFormat}
          minDate={start ? start : undefined}
          clearable={true}
          showToolbar={false}
          onChange={endChanged}
          renderInput={(params) => <TextField {...params} />}
        />
      </FormControl>
    </Box>
  )
}
