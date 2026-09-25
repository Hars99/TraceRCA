import type { RequestLog } from "./types";

export function writeLog(log: RequestLog): void {
  console.log(JSON.stringify(log));
}
