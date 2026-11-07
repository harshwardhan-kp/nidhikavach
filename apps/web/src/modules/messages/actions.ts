"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";

export async function markAllRead() {
  const user = await requireUser();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.channel, "inbox"), eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  revalidatePath("/app", "layout");
}
