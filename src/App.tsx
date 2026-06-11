import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./pages/HomePage";
import { TermPage } from "./pages/TermPage";
import { TourPage } from "./pages/TourPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Hash routing keeps deep links working on GitHub Pages without a 404 fallback.
const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "term/:termId", element: <TermPage /> },
      { path: "tour", element: <TourPage /> },
      { path: "tour/:stepIndex", element: <TourPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App(): React.JSX.Element {
  return <RouterProvider router={router} />;
}
