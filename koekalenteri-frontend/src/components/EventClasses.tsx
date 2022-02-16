import { CheckBox, CheckBoxOutlineBlank } from "@mui/icons-material";
import { Autocomplete, AutocompleteChangeReason, Avatar, Checkbox, Chip, TextField } from "@mui/material";
import { isSameDay } from "date-fns";
import { t } from "i18next";
import { EventClass } from "koekalenteri-shared/model";
import { PartialEvent } from ".";


/**
 * Callback fired when the value changes.
 *
 * @param {React.SyntheticEvent} event The event source of the callback.
 * @param {T|T[]} value The new value of the component.
 * @param {string} reason One of "createOption", "selectOption", "removeOption", "blur" or "clear".
 */
type EventClassesOnChange = (
  event: React.SyntheticEvent,
  value: EventClass[],
  reason: AutocompleteChangeReason
) => void;


type EventClassesProps = {
  id: string
  event: PartialEvent
  value: EventClass[] | undefined
  classes: EventClass[]
  label: string
  required?: boolean
  onChange: EventClassesOnChange
}

export const compareEventClass = (a: EventClass, b: EventClass) =>
  isSameDay(a.date || new Date(), b.date || new Date())
    ? a.class.localeCompare(b.class)
    : (a.date?.valueOf() || 0) - (b.date?.valueOf() || 0);

export function EventClasses(props: EventClassesProps) {
  if (props.value) {
    props.value.sort(compareEventClass);
  }

  const { classes, label, event, required, ...rest } = props;
  const error = required && props.value?.length === 0;

  return (
    <Autocomplete
      {...rest}
      fullWidth
      disableClearable
      disableCloseOnSelect
      disabled={classes.length === 0}
      multiple
      groupBy={c => t('weekday', { date: c.date })}
      options={classes}
      getOptionLabel={c => c.class}
      isOptionEqualToValue={(o, v) => compareEventClass(o, v) === 0}
      renderOption={(props, option, { selected }) => (
        <li {...props}>
          <Checkbox
            icon={<CheckBoxOutlineBlank fontSize="small" />}
            checkedIcon={<CheckBox fontSize="small" />}
            style={{ marginRight: 8 }}
            checked={selected}
          />
          {option.class}
        </li>
      )}
      renderInput={(params) => <TextField {...params} required={required} error={error} label={label} />}
      renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
        <Chip
          {...getTagProps({ index })}
          avatar={
            <Avatar
              sx={{
                fontWeight: 'bold',
                bgcolor: isSameDay(option.date || event.startDate, event.startDate) ? 'secondary.light' : 'secondary.dark'
              }}
            >
              {t('weekday', { date: option.date })}
            </Avatar>
          }
          label={option.class}
          onDelete={undefined}
          size="small"
          sx={{bgcolor: option.judge?.id ? 'background.ok' : 'transparent'}}
          variant={option.judge ? "filled" : "outlined"}
        />
      ))}
    />
  );
}
