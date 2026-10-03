"use client";

import { AppUserMenu } from "@/components/shared/AppUserMenu";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppTopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6">
      <SidebarTrigger className="-ml-2" />
      <AppUserMenu />
    </header>
  );
}