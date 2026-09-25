"use client";

import {
  BookOpen,
  CalendarCog,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
} from "lucide-react";

import {
  AppSidebar,
  type AppSidebarNavGroup,
} from "@/components/shared/AppSidebar";
import { APP_ROUTES } from "@/constants/routes";

const DEAN_NAV: readonly AppSidebarNavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: APP_ROUTES.dean,
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Manage",
    items: [
      {
        title: "Manage Rooms",
        href: APP_ROUTES.deanRooms,
        icon: DoorOpen,
      },
      {
        title: "Manage Subjects",
        href: APP_ROUTES.deanSubjects,
        icon: BookOpen,
      },
      {
        title: "Manage Courses",
        href: APP_ROUTES.deanCourses,
        icon: GraduationCap,
      },
      {
        title: "Generate Schedule",
        href: APP_ROUTES.deanSchedule,
        icon: CalendarCog,
      },
    ],
  },
];

export function DeanSidebar() {
  return <AppSidebar groups={DEAN_NAV} />;
}