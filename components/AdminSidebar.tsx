"use client";

import {
  Building2,
  CalendarRange,
  DoorOpen,
  LayoutDashboard,
  UserCheck,
} from "lucide-react";

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
  {
    title: "Management",
    items: [
      {
        title: "Manage Rooms",
        href: APP_ROUTES.adminRooms,
        icon: DoorOpen,
      },
      {
        title: "Manage Departments",
        href: APP_ROUTES.adminDepartments,
        icon: Building2,
      },
      {
        title: "Manage Deans",
        href: APP_ROUTES.adminDeans,
        icon: UserCheck,
      },
    ],
  },
  {
    title: "Schedules",
    items: [
      {
        title: "Compiled Schedule",
        href: APP_ROUTES.adminSchedule,
        icon: CalendarRange,
      },
    ],
  },
];

export function AdminSidebar() {
  return <AppSidebar groups={ADMIN_NAV} />;
}
