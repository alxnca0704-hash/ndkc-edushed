"use client";

import { Show, UserButton } from "@clerk/nextjs";

import { useUserSync } from "@/hooks/useUserSync";

export function AppUserMenu() {
  useUserSync();

  return (
    <Show when="signed-in">
      <UserButton />
    </Show>
  );
}