import Image from "next/image";

import { SidebarHeader } from "@/components/ui/sidebar";

const APP_TITLE = "NDKC EduSched";
const APP_SUBTITLE = "Class scheduling";

export function AppSidebarHeader() {
  return (
    <SidebarHeader>
      <div className="flex items-center gap-2.5 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Image
          src="/ndkc-logo.png"
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-lg object-contain"
        />
        <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-medium">{APP_TITLE}</span>
          <span className="truncate text-xs text-muted-foreground">
            {APP_SUBTITLE}
          </span>
        </div>
      </div>
    </SidebarHeader>
  );
}