import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export const useSubscription = () => {
  const billingEnabled = process.env.NEXT_PUBLIC_ENABLE_POLAR_BILLING === "true";

  return useQuery({
    queryKey: ["subscription"],
    enabled: billingEnabled,
    queryFn: async () => {
      if (!billingEnabled) {
        return null;
      }

      try {
        const { data } = await authClient.customer.state();
        return data;
      } catch {
        return null;
      }
    },
  });
};

export const useHasActiveSubscription = () => {
  const { data: customerState, isLoading, ...rest } = 
    useSubscription();

  const hasActiveSubscription =
    customerState?.activeSubscriptions &&
    customerState.activeSubscriptions.length > 0;

  return {
    hasActiveSubscription,
    subscription: customerState?.activeSubscriptions?.[0],
    isLoading,
    ...rest,
  };
};
