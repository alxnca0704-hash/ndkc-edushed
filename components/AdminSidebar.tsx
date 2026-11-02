"use client";

import { LayoutDashboard } from "lucide-react";

import {
  AppSidebar,
  type AppSidebarNavGroup,
} from "@/components/shared/AppSidebar";
import { APP_ROUTES } from "@/constants/routes";

const ADMIN_NAV: readonly AppSidebarNavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Home",
        href: APP_ROUTES.admin,
        icon: LayoutDashboard,
      },
    ],
  },
];

export function AdminSidebar() {
  return <AppSidebar groups={ADMIN_NAV} />;
}
