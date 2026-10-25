import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emitNotice } from "./utils/notify";
import { getErrorInfo } from "./utils/errorCodes";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./index.css";

const queryClient = new QueryClient({
  // A failed load must never look like "no data". Screens that only check
  // `isLoading` would otherwise show reassuring empty states ("No dead stock —
  // nice work") when the request actually failed. Surface every failed load.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error?.response?.status === 401) return; // handled by the auth flow
      if (query.meta?.silent) return;
      emitNotice({ type: "load_error", message: getErrorInfo(error).message });
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
