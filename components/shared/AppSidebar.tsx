"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export interface AppSidebarNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface AppSidebarNavGroup {
  title: string;
  items: AppSidebarNavItem[];
}

export function AppSidebar({
  groups,
}: {
  groups: readonly AppSidebarNavGroup[];
}) {
  const pathname = usePathname();

  return (
    <Sidebar
      collapsible="icon"
      style={
        {
          top: "var(--app-header-height)",
          bottom: "0px",
          height: "auto",
        } as CSSProperties
      }
    >
      <SidebarContent className="gap-2">
        {groups.map((group, groupIndex) => (
          <SidebarGroup
            key={group.title}
            className={cn(
              groupIndex > 0 && "pt-4 group-data-[collapsible=icon]:pt-2",
            )}
          >
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                        tooltip={item.title}
                        className="h-9"
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}