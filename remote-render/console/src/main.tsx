import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {MotionConfig} from "motion/react";
import {StrictMode} from "react";
import {createRoot} from "react-dom/client";

import {App} from "./App";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
