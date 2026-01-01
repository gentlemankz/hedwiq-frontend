import { SubscriptionProvider } from "@/contexts/subscription-context";

interface CheckoutLayoutProps {
  children: React.ReactNode;
}

export default function CheckoutLayout({ children }: CheckoutLayoutProps) {
  return <SubscriptionProvider>{children}</SubscriptionProvider>;
}
