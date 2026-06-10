import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode, type ErrorInfo } from "react";
import { SolanaProviders } from "./providers/SolanaProviders";
import { ProgramProvider } from "./providers/ProgramProvider";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { CreateCirclePage } from "./pages/CreateCirclePage";
import { CircleDashboardPage } from "./pages/CircleDashboardPage";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("App crash:", error, info); }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: 32, fontFamily: "monospace", whiteSpace: "pre-wrap", color: "#dc2626" }}>
          <strong>App crashed — open DevTools Console for full stack trace</strong>
          {"\n\n"}{err.message}{"\n"}{err.stack}
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 2,
    },
  },
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "create", element: <CreateCirclePage /> },
      { path: "circle/:address", element: <CircleDashboardPage /> },
    ],
  },
]);

export default function App() {
  return (
    <ErrorBoundary>
      <SolanaProviders>
        <ProgramProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ProgramProvider>
      </SolanaProviders>
    </ErrorBoundary>
  );
}
