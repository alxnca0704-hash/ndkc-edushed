import { createClerkClient } from "@clerk/nextjs/server";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const clerk = createClerkClient({
  secretKey: requireEnv("CLERK_SECRET_KEY"),
});

type Role = "admin" | "dean" | "teacher";

interface SeedUser {
  email: string;
  password?: string;
  role: Role;
  firstName?: string;
  lastName?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const adminOnly = process.argv.includes("--admin-only");

const seedUsers: SeedUser[] = [
  {
    email: requireEnv("SEED_ADMIN_EMAIL"),
    password: process.env.SEED_ADMIN_PASSWORD,
    role: "admin",
  },
  ...(adminOnly
    ? []
    : [
        {
          email: requireEnv("SEED_DEAN_EMAIL"),
          password: requireEnv("SEED_DEAN_PASSWORD"),
          role: "dean" as const,
          firstName: "Alexander",
          lastName: "Carbonell",
        },
        {
          email: requireEnv("SEED_TEACHER_EMAIL"),
          password: requireEnv("SEED_TEACHER_PASSWORD"),
          role: "teacher" as const,
          firstName: "Zyneer",
          lastName: "Moreno",
        },
      ]),
];

async function upsertUser({ email, password, role, firstName, lastName }: SeedUser) {
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });

  if (data.length > 0) {
    const user = data[0];
    const currentRole = user.publicMetadata?.role as Role | undefined;
    const hasName =
      (firstName === undefined || user.firstName === firstName) &&
      (lastName === undefined || user.lastName === lastName);

    if (currentRole !== role || !hasName) {
      await clerk.users.updateUser(user.id, {
        firstName,
        lastName,
        publicMetadata: { ...user.publicMetadata, role },
      });
      console.log(
        `updated ${email} (${user.id}) role/name -> ${role} ${firstName ?? ""} ${lastName ?? ""}`.trim(),
      );
    } else {
      console.log(`ok ${email} (${user.id}) already up to date`);
    }
    return;
  }

  const created = await clerk.users.createUser({
    emailAddress: [email],
    ...(password ? { password } : {}),
    firstName,
    lastName,
    publicMetadata: { role },
  });
  console.log(`created ${email} (${created.id}) as ${role}`);
}

async function main() {
  for (const user of seedUsers) {
    await upsertUser(user);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
