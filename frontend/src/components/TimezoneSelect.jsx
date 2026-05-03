import { useMemo } from 'react';
import { getTimeZoneOptionsForValue } from '../utils/timezones';

export default function TimezoneSelect({
  id,
  name,
  value,
  onChange,
  disabled,
  required,
  'aria-label': ariaLabel,
}) {
  const options = useMemo(() => getTimeZoneOptionsForValue(value), [value]);

  return (
    <select
      id={id}
      name={name}
      className="timezone-select"
      value={value}
      onChange={onChange}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
    >
      {options.map((tz) => (
        <option key={tz} value={tz}>
          {tz}
        </option>
      ))}
    </select>
  );
}
