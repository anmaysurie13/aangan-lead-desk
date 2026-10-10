const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
/** e.g. "Mon, 12 Oct, 9:00 am" in India time. */
export const formatIst = (iso: string) => IST.format(new Date(iso));
