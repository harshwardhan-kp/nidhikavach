import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  return (await cookies()).get(LANG_COOKIE)?.value === "hi" ? "hi" : "en";
}
