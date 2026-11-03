import type { ReactNode } from "react";

import { TeacherSidebar } from "@/components/TeacherSidebar";
import { AppTopBar } from "@/components/shared/AppTopBar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ROLES } from "@/constants/roles";
import { requireRole } from "@/hooks/useAuth";

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRole(ROLES.teacher);

  return (
    <SidebarProvider>
      <TeacherSidebar />
      <div className="relative flex w-full flex-1 flex-col">
        <AppTopBar />
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </SidebarProvider>
  );
}