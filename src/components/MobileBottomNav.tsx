"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Fuel, Database, CreditCard, BarChart3 } from "lucide-react";

export function MobileBottomNav() {
  const pathname = usePathname();

  // Hide mobile nav on login screen
  if (pathname === "/login") return null;

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Sales", href: "/sales", icon: Fuel },
    { label: "Stock", href: "/stock", icon: Database },
    { label: "Credit", href: "/credit", icon: CreditCard },
    { label: "Reports", href: "/reports", icon: BarChart3 },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-md border-t border-[var(--border-color)] pb-safe shadow-lg">
      <div className="flex items-center justify-around h-14 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full px-1 transition-colors relative ${
                isActive
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {isActive && (
                <span className="absolute top-0 w-8 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
              )}
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? "scale-110 stroke-[2.5]" : "stroke-[1.75]"}`} />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
