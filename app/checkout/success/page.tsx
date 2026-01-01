import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CheckoutSuccessClient } from "./checkout-success-client";

export default async function CheckoutSuccessPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return <CheckoutSuccessClient />;
}
