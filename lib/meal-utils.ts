export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function cleanOcrText(value: string) {
  return value.split(/\r?\n/).map(line => line
    .replace(/\s+\d{1,3}(?:,\d{3})*원.*$/, "")
    .replace(/\s+\d{2}:\d{2}\s*[-~]\s*\d{2}:\d{2}.*$/, "")
    .trim())
    .filter(line => line && !/^(?:오늘|내일|어제|아침|점심|저녁|조식|중식|석식)$/.test(line)
      && !/식샤|식당|전체 메뉴|오늘\s*뭐\s*먹지|\d{1,2}월\s*\d{1,2}일/.test(line))
    .slice(0, 30).join("\n");
}
