import Image from "next/image";
import Link from "next/link";

export function Logo({ href = "/", sub = "[aicte · regulation]" }: { href?: string; sub?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <Image src="/assets/logo.png" alt="" width={28} height={28} className="h-7 w-auto" priority />
      <span className="leading-tight">
        <span className="block text-[17px] font-semibold tracking-[-0.4px]">nidhikavach</span>
        <span className="tag block">{sub}</span>
      </span>
    </Link>
  );
}
