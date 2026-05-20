export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function groupDaysByWeek(year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  const weeks = [];
  let currentWeek = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    currentWeek.push({
      day,
      date: dateStr,
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });

    // If it's Sunday (0) or the last day of the month, end the week
    if (dayOfWeek === 0 || day === daysInMonth) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  return weeks;
}
