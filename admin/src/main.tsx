import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { RequireAdmin } from "./components/RequireAdmin";
import "./index.css";
import { AuthProvider } from "./lib/auth";
import { AirportsPage } from "./pages/Airports";
import { BookingsPage } from "./pages/Bookings";
import { CategoriesPage } from "./pages/Categories";
import { CountriesPage } from "./pages/Countries";
import { CustomersPage } from "./pages/Customers";
import { GalleryImagesPage } from "./pages/GalleryImages";
import { HomeCoversPage } from "./pages/HomeCovers";
import { LoginPage } from "./pages/Login";
import { NotificationsPage } from "./pages/Notifications";
import { PromoCodesPage } from "./pages/PromoCodes";
import { ReferralsPage } from "./pages/Referrals";
import { ReviewsPage } from "./pages/Reviews";
import { SettingsPage } from "./pages/Settings";
import { TourAirportPricesPage } from "./pages/TourAirportPrices";
import { TourDatesPage } from "./pages/TourDates";
import { ToursPage } from "./pages/Tours";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAdmin roles={["admin"]} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <Navigate to="/tours" replace /> },
          { path: "/bookings", element: <BookingsPage /> },
          { path: "/customers", element: <CustomersPage /> },
          { path: "/tours", element: <ToursPage /> },
          { path: "/countries", element: <CountriesPage /> },
          { path: "/airports", element: <AirportsPage /> },
          { path: "/categories", element: <CategoriesPage /> },
          { path: "/promo-codes", element: <PromoCodesPage /> },
          { path: "/notifications", element: <NotificationsPage /> },
          { path: "/reviews", element: <ReviewsPage /> },
          { path: "/referrals", element: <ReferralsPage /> },
          { path: "/tour-dates", element: <TourDatesPage /> },
          { path: "/tour-airport-prices", element: <TourAirportPricesPage /> },
          { path: "/gallery-images", element: <GalleryImagesPage /> },
          { path: "/home-covers", element: <HomeCoversPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
