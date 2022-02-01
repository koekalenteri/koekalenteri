import { DatePicker } from "@mui/lab";
import { Box, FormControl, TextField } from "@mui/material";
import { useTranslation } from 'react-i18next';

type DateValue = Date | null;

export type DateRangeProps = {
  start: DateValue,
  startLabel: string,
  end: DateValue
  endLabel: string,
  required?: boolean,
  onChange?: (start: DateValue, end: DateValue) => void
};

export function DateRange({ start, end, startLabel, endLabel, required, onChange }: DateRangeProps) {
  const { t } = useTranslation();
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
          mask={t('datemask')}
          inputFormat={t('dateformat')}
          maxDate={end ? end : undefined}
          clearable={true}
          showToolbar={false}
          onChange={startChanged}
          renderInput={(params) => <TextField {...params} required={required} />}
        />
      </FormControl>

      <FormControl sx={{pl: 0.5, width: '50%'}}>
        <DatePicker
          label={endLabel}
          value={end}
          mask={t('datemask')}
          inputFormat={t('dateformat')}
          minDate={start ? start : undefined}
          clearable={true}
          showToolbar={false}
          onChange={endChanged}
          renderInput={(params) => <TextField {...params} required={required} />}
        />
      </FormControl>
    </Box>
  )
}
