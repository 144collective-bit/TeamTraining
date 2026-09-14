import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { routes } from "@/lib/routes";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? routes.home : routes.login);
}
