import {
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
} from 'date-fns'

// Map interval type to corresponding date-fns function
const intervalMap = {
  minute: addMinutes,
  hour: addHours,
  day: addDays,
  week: addWeeks,
  month: addMonths,
  quarter: addQuarters,
  year: addYears,
};

// Usage example:
//   const now = new Date();
//   console.log(addInterval(now, 'day', 5));    // adds 5 days
//   console.log(addInterval(now, 'week', 2));   // adds 2 weeks
//   console.log(addInterval(now, 'month', 1));  // adds 1 month
//   console.log(addInterval(now, 'year', 3));   // adds 3 years
export function addInterval(date, intervalType, amount = 1) {
  const addFn = intervalMap[intervalType];
  if (!addFn) throw new Error(`Unsupported interval type: ${intervalType}`);
  return addFn(date, amount);
}

