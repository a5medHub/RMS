import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/app" replace />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/app",
    element: <DashboardPage />,
  },
  {
    path: "*",
    element: <Navigate to="/app" replace />,
  },
]);

const App = () => {
  return <RouterProvider router={router} />;
};

export default App;


