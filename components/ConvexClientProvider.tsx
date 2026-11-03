"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

import { RoleSyncListener } from "@/components/RoleSyncListener";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export interface ConvexClientProviderProps {
  children: ReactNode;
}

export function ConvexClientProvider({
  children,
}: ConvexClientProviderProps) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <RoleSyncListener />
      {children}
    </ConvexProviderWithClerk>
  );
}
