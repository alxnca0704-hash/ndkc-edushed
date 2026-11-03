import { auth, createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ROLES } from "@/constants/roles";

export async function POST(req: Request) {
  try {
    const { userId, sessionClaims } = await auth();

    if (!userId || sessionClaims?.metadata?.role !== ROLES.admin) {
      return NextResponse.json(
        { error: "Unauthorized: Only Admin can update user roles" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      clerkId?: string;
      role?: "admin" | "dean" | "teacher";
    };

    const { clerkId, role } = body;

    if (!clerkId || !role) {
      return NextResponse.json(
        { error: "Missing clerkId or role" },
        { status: 400 },
      );
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: "CLERK_SECRET_KEY is not configured" },
        { status: 500 },
      );
    }

    const clerk = createClerkClient({ secretKey });
    await clerk.users.updateUser(clerkId, {
      publicMetadata: {
        role,
      },
    });

    return NextResponse.json({ ok: true, clerkId, role });
  } catch (err) {
    console.error("Error updating Clerk role:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update Clerk role",
      },
      { status: 500 },
    );
  }
}
