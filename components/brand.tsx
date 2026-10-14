import Image from "next/image";
import { cn } from "@/lib/utils";

export const DEFAULT_BRAND_NAME = "SchoolSphere";

export type SchoolBrandConfig = {
  name?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

/** Shared school/platform mark. Organization context can override these props when available. */
export function Brand({
  brand,
  className,
  markClassName,
  nameClassName,
  showName = true,
}: {
  brand?: SchoolBrandConfig | null;
  className?: string;
  markClassName?: string;
  nameClassName?: string;
  showName?: boolean;
}) {
  const name = brand?.name?.trim() || DEFAULT_BRAND_NAME;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {brand?.logoUrl ? (
        <Image
          src={brand.logoUrl}
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          unoptimized
          className={cn("size-9 shrink-0 rounded-lg object-contain", markClassName)}
          style={brand.primaryColor ? { backgroundColor: brand.primaryColor } : undefined}
        />
      ) : (
        <svg
          viewBox="0 0 40 40"
          aria-hidden="true"
          className={cn("size-9 shrink-0", markClassName)}
          style={brand?.primaryColor ? { color: brand.primaryColor } : undefined}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="2" width="36" height="36" rx="12" fill="currentColor" className="text-primary" />
          <path d="M10 16.5 20 11l10 5.5-10 5.5-10-5.5Z" fill="white" />
          <path d="M14 19v5.3c3.7 2.6 8.3 2.6 12 0V19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M30 17v6" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="30" cy="25" r="1.4" fill="white" />
        </svg>
      )}
      {showName ? <span className={cn("truncate font-semibold tracking-tight", nameClassName)}>{name}</span> : null}
    </span>
  );
}
