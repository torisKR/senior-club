import Image from "next/image";
import Link from "next/link";

import { clsx } from "clsx";

type BrandProps = {
  className?: string;
  compact?: boolean;
  priority?: boolean;
};

/**
 * Senior Club's shared home link. The visible name is kept next to the mark so
 * the brand does not rely on an image alone for recognition.
 */
export function Brand({ className, compact = false, priority = false }: BrandProps) {
  return (
    <Link
      className={clsx(
        "group inline-flex min-h-13 shrink-0 items-center gap-2.5 rounded-2xl no-underline",
        "focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--sun)]",
        className,
      )}
      href="/"
    >
      <span className="relative size-11 shrink-0 overflow-hidden rounded-[0.85rem] border border-[var(--line)] bg-white shadow-sm sm:size-12">
        <Image
          alt=""
          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.04] motion-reduce:transition-none"
          height={48}
          priority={priority}
          sizes="48px"
          src="/images/senior-club-mark-v3.png"
          width={48}
        />
      </span>
      <span className="min-w-0 leading-none">
        <span className="block whitespace-nowrap text-[1.08rem] font-black tracking-[-0.045em] text-[var(--primary-strong)] sm:text-xl">
          시니어클럽
        </span>
        {!compact && (
          <span className="mt-1 hidden whitespace-nowrap text-[0.68rem] font-bold tracking-[-0.01em] text-[var(--muted)] xl:block">
            다음 약속이 생기는 곳
          </span>
        )}
      </span>
    </Link>
  );
}
