import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { cn, formatDateTime } from "@/lib/utils";
import { markAllRead } from "@/modules/messages/actions";
import { inbox } from "@/modules/messages/queries";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const user = await requireUser();
  const items = await inbox(user);
  const unread = items.filter((m) => !m.readAt).length;
  return (
    <>
      <PageHeader title="your" italic="inbox" sub={`[${user.name} · ${unread} unread · reminders, escalations and case events]`}>
        {unread ? (
          <form action={markAllRead}>
            <Button variant="light" size="sm">
              [mark all read]
            </Button>
          </form>
        ) : null}
      </PageHeader>
      <Card className="divide-y divide-line-2">
        {items.map((m) => (
          <div key={m.id} className={cn("flex gap-3 px-5 py-3.5", !m.readAt && "bg-amber-soft/30")}>
            <Bell size={15} className={cn("mt-0.5 shrink-0", m.readAt ? "text-mut" : "text-red")} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                {m.link ? (
                  <Link href={m.link} className={cn("text-[13.5px] hover:underline", !m.readAt && "font-semibold")}>
                    {m.subject}
                  </Link>
                ) : (
                  <span className={cn("text-[13.5px]", !m.readAt && "font-semibold")}>{m.subject}</span>
                )}
                <span className="tag shrink-0">{formatDateTime(m.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-[12.5px] text-txt">{m.body}</p>
              {m.reminderId ? <span className="tag">[lifecycle reminder]</span> : null}
            </div>
          </div>
        ))}
        {!items.length ? <p className="px-5 py-10 text-center text-[13px] text-txt">Nothing here yet. Move the demo clock forward (admin) to see maturity reminders arrive.</p> : null}
      </Card>
    </>
  );
}
