export function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
export function close(a: number, b: number, tol: number, msg: string): void {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg}: got ${a}, expected ${b} ± ${tol}`);
}
