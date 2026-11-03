import { redirect } from "next/navigation";

import { APP_ROUTES } from "@/constants/routes";

export default function DeanRoomsPage() {
  redirect(APP_ROUTES.dean);
}
