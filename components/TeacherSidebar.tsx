"use client";

import { CalendarClock, CalendarRange, LayoutDashboard } from "lucide-react";

import {
  AppSidebar,
  type AppSidebarNavGroup,
} from "@/components/shared/AppSidebar";
import { APP_ROUTES } from "@/constants/routes";

const TEACHER_NAV: readonly AppSidebarNavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: APP_ROUTES.teacher,
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Schedule",
    items: [
      {
        title: "Availability",
        href: APP_ROUTES.teacherAvailability,
        icon: CalendarClock,
      },
      {
        title: "My Schedule",
        href: APP_ROUTES.teacherSchedule,
        icon: CalendarRange,
      },
    ],
  },
];

export function TeacherSidebar() {
  return <AppSidebar groups={TEACHER_NAV} />;
}