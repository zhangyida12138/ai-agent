function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDisplayDateTime(input: string | number | Date): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '-';
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${y}年${m}月${d}日 ${hh}:${mm}:${ss}`;
}
