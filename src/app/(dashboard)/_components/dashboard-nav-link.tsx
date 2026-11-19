"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

type DashboardNavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export function DashboardNavLink({ href, ...props }: DashboardNavLinkProps) {
  const pathname = usePathname();
  const isCurrent = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return <Link {...props} href={href} aria-current={isCurrent ? "page" : undefined} />;
}
