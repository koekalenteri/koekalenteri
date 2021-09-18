import { DatePicker } from "@mui/lab";
import { FormControl, TextField } from "@mui/material";
import { Fragment } from "react";

type DateValue = Date | null;

type DateRangeProps = {
  start: DateValue,
  startLabel: string,
  end: DateValue
  endLabel: string,
  onChange: (start: DateValue, end: DateValue) => void
};

const inputFormat = 'dd.MM.yyyy';

export default function DateRange({ start, end, startLabel, endLabel, onChange }: DateRangeProps) {
  const startChanged = (date: DateValue) => {
    start = date;
    onChange(start, end);
  };
  const endChanged = (date: DateValue) => {
    end = date;
    onChange(start, end);
  };
  return (
    <Fragment>
      <FormControl sx={{mr: 1, width: '45%', minWidth: 150}}>
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
          views={['month', 'day']}
        />
      </FormControl>

      <FormControl sx={{width: '45%', minWidth: 150}}>
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
          views={['month', 'day']}
        />
      </FormControl>
    </Fragment>
  )
}
