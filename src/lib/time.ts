export function taipeiDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function dateNumber(date: string): number { return Date.parse(`${date}T00:00:00+08:00`) }
