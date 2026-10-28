import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { ApiError, initAuth } from "./lib/api";
import { UiProvider } from "./components/ui";

initAuth();

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (e) => {
      // 423: Archiv wurde inzwischen gesperrt -> Status neu laden, dann zeigt die App die Sperre
      if (e instanceof ApiError && e.status === 423) void queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  }),
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true, staleTime: 5000 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UiProvider>
        <App />
      </UiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
