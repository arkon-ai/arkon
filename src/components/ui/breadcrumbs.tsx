"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { getBreadcrumbs } from "@/lib/page-meta";

export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-[#8888A0]">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-[#555566]" />}
            {i === 0 ? (
              <Link href={crumb.href} className="hover:text-[#E4E4ED] transition-colors">
                <Home className="h-3.5 w-3.5" />
              </Link>
            ) : isLast ? (
              <span className="text-[#E4E4ED] font-medium">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-[#E4E4ED] transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
