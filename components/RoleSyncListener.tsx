"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";

import { api } from "@/convex/_generated/api";

export function RoleSyncListener() {
  const { user, isLoaded } = useUser();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !user || !currentUser || isRefreshingRef.current) {
      return;
    }

    const clerkRole = (user.publicMetadata?.role as string | undefined) ?? null;
    const dbRole = currentUser.role ?? null;

    // If the database role has changed compared to Clerk client session role:
    if (dbRole && clerkRole !== dbRole) {
      isRefreshingRef.current = true;
      void (async () => {
        try {
          await user.reload();
        } catch (err) {
          console.error("Failed to reload Clerk user profile:", err);
        }
        window.location.reload();
      })();
    }
  }, [isLoaded, user, currentUser]);

  return null;
}
