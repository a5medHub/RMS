import { Suspense, lazy } from "react";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

const DashboardPage = lazy(async () => {
  const module = await import("./pages/DashboardPage");
  return { default: module.DashboardPage };
});

const LoginPage = lazy(async () => {
  const module = await import("./pages/LoginPage");
  return { default: module.LoginPage };
});

const RecipeDetailsPage = lazy(async () => {
  const module = await import("./pages/RecipeDetailsPage");
  return { default: module.RecipeDetailsPage };
});

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<p className="center-text">Loading...</p>}>
    {element}
  </Suspense>
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/app" replace />,
  },
  {
    path: "/login",
    element: withSuspense(<LoginPage />),
  },
  {
    path: "/app",
    element: withSuspense(<DashboardPage />),
  },
  {
    path: "/app/recipes/:recipeId",
    element: withSuspense(<RecipeDetailsPage />),
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


