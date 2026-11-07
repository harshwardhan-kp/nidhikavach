"use server";

import { cookies } from "next/headers";
import { LANG_COOKIE } from "./i18n";

export async function setLang(lang: string) {
  (await cookies()).set(LANG_COOKIE, lang === "hi" ? "hi" : "en", { path: "/", maxAge: 31_536_000, sameSite: "lax" });
}
