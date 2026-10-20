import bcrypt from "bcryptjs";

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Minimum policy: 10+ chars, with letters and digits. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "يجب ألا تقل كلمة المرور عن 10 أحرف";
  if (pw.length > 128) return "كلمة المرور طويلة جدًا";
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/\d/.test(pw)) return "يجب أن تحتوي كلمة المرور على أحرف وأرقام";
  return null;
}

// Hash compared against when the email is unknown, so login timing does not reveal accounts.
let dummyHash: Promise<string> | null = null;
export const dummyHashFor = () => (dummyHash ??= bcrypt.hash("rayed-timing-equaliser", COST));
