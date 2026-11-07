import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-card", className)} {...props} />;
}

export function PageHeader({ title, italic, sub, children }: { title: string; italic?: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-[34px] leading-none tracking-[-0.5px]">
          {title} {italic ? <i>{italic}</i> : null}
        </h1>
        {sub ? <p className="tag mt-2 text-[12px]">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="tag">[{label}]</div>
      <div className={cn("mt-2 text-[28px] font-semibold tracking-[-0.6px]", accent && "text-red")}>{value}</div>
      {hint ? <div className="mt-0.5 text-[12px] text-txt">{hint}</div> : null}
    </Card>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "dark" | "light" | "ghost" | "danger"; size?: "sm" | "md" };

export function Button({ className, variant = "dark", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-mono transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40",
        size === "md" ? "px-4 py-2.5 text-[13px]" : "px-3 py-1.5 text-[12px]",
        variant === "dark" && "bg-ink-2 text-white",
        variant === "light" && "bg-chip text-ink",
        variant === "ghost" && "text-txt hover:bg-chip",
        variant === "danger" && "bg-red text-white",
        className,
      )}
      {...props}
    />
  );
}

const pillTone = {
  neutral: "bg-chip text-txt",
  red: "bg-red-soft text-red",
  amber: "bg-amber-soft text-amber",
  green: "bg-green-soft text-green",
  blue: "bg-blue-soft text-blue",
  dark: "bg-ink-2 text-white",
} as const;

export function Pill({ tone = "neutral", className, children }: { tone?: keyof typeof pillTone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px]", pillTone[tone], className)}>{children}</span>;
}

export function Simulated({ what = "simulated" }: { what?: string }) {
  return (
    <span className="rounded border border-dashed border-mut px-1.5 py-px font-mono text-[10px] text-mut" title="This part of the prototype is simulated">
      [{what}]
    </span>
  );
}
