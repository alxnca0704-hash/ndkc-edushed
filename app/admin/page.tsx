import { ROLES } from "@/constants/roles";
import { requireRole } from "@/hooks/useAuth";

export default async function AdminPage() {
  await requireRole(ROLES.admin);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Admin Home</h1>
        <p className="text-sm text-muted-foreground">
          The admin workspace is ready. Administration tools will appear here.
        </p>
      </div>
      <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium">Welcome to NDKC EduSched</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This home page is a placeholder for future admin tools.
        </p>
      </section>
    </div>
  );
}
