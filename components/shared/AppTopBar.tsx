"use client";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { AppUserMenu } from "@/components/shared/AppUserMenu";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * The shell both role dashboards sit in, so anything the signed-in user has to
 * react to goes here rather than inside one of the pages: the bell first, then
 * the account menu at the far end.
 */
export function AppTopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6">
      <SidebarTrigger className="-ml-2" />
      <div className="flex items-center gap-1">
        <NotificationBell />
        <AppUserMenu />
      </div>
    </header>
  );
}