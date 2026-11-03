import Link from "next/link";
import {
  Building2,
  CalendarRange,
  DoorOpen,
  UserCheck,
} from "lucide-react";

import { ROLES } from "@/constants/roles";
import { APP_ROUTES } from "@/constants/routes";
import { requireRole } from "@/hooks/useAuth";

export default async function AdminPage() {
  await requireRole(ROLES.admin);

  const adminFeatures = [
    {
      title: "Manage Rooms",
      description: "Manage institution-wide room inventory, types, and facilities.",
      href: APP_ROUTES.adminRooms,
      icon: DoorOpen,
      tag: "Room CRUD",
    },
    {
      title: "Manage Departments",
      description: "Configure academic departments and colleges across the school.",
      href: APP_ROUTES.adminDepartments,
      icon: Building2,
      tag: "Department CRUD",
    },
    {
      title: "Manage Deans",
      description: "Assign leadership to departments and manage dean accounts.",
      href: APP_ROUTES.adminDeans,
      icon: UserCheck,
      tag: "Dean Accounts",
    },
    {
      title: "Compiled Schedule",
      description: "View combined department timetables and resolve conflicts with CSP.",
      href: APP_ROUTES.adminSchedule,
      icon: CalendarRange,
      tag: "CSP Conflict Engine",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Admin Overview</h1>
        <p className="text-sm text-muted-foreground">
          Centralized administrative management for rooms, departments, deans, and multi-department scheduling.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {adminFeatures.map((feature) => (
          <Link
            key={feature.href}
            href={feature.href}
            className="group block rounded-xl border border-border/60 bg-card p-5 shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-md focus-visible:outline-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <feature.icon className="size-5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {feature.tag}
              </span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground group-hover:text-primary transition-colors">
              {feature.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {feature.description}
            </p>
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-border/60 bg-card p-6 shadow-xs">
        <h2 className="text-sm font-semibold">Multi-Department Thesis Objective</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          In this multi-department scheduling system, individual Deans generate departmental schedules
          for their respective programs. The Admin manages shared physical rooms and compiles the master
          schedule across departments. When resource clashes occur (e.g., two departments booking the same room or shared faculty),
          the system leverages the <strong>Constraint Satisfaction Problem (CSP)</strong> backtracking algorithm to
          automatically resolve cross-department conflicts with minimal disruption.
        </p>
      </section>
    </div>
  );
}
