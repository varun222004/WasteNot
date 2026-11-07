import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/Display";
import HomePage from "@/pages/HomePage";
import DiscoverPage from "@/pages/DiscoverPage";
import ListingDetailPage from "@/pages/ListingDetailPage";
import ListingFormPage from "@/pages/ListingFormPage";
import WantedPage from "@/pages/WantedPage";
import WantedDetailPage from "@/pages/WantedDetailPage";
import LoginPage from "@/pages/LoginPage";
import ProfilePage from "@/pages/ProfilePage";
import MyActivityPage from "@/pages/MyActivityPage";
import SettingsPage from "@/pages/SettingsPage";
import ReservationPage from "@/pages/ReservationPage";
import MessagesPage from "@/pages/MessagesPage";
import NotificationsPage from "@/pages/NotificationsPage";
import OrganizationPage from "@/pages/OrganizationPage";
import OrgPublicPage from "@/pages/OrgPublicPage";
import AdminPage from "@/pages/AdminPage";
import ImpactPage from "@/pages/ImpactPage";
import NotFoundPage from "@/pages/NotFoundPage";

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="container-page py-16"><Skeleton className="h-40 w-full" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== "admin") return <NotFoundPage />;
  return <>{children}</>;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const guard = (el: ReactNode, admin = false) => <RequireAuth admin={admin}>{el}</RequireAuth>;
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/listings/new" element={guard(<ListingFormPage />)} />
          <Route path="/listings/:id" element={<ListingDetailPage />} />
          <Route path="/listings/:id/edit" element={guard(<ListingFormPage />)} />
          <Route path="/wanted" element={<WantedPage />} />
          <Route path="/wanted/:id" element={<WantedDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/u/:id" element={<ProfilePage />} />
          <Route path="/me" element={guard(<MyActivityPage />)} />
          <Route path="/settings" element={guard(<SettingsPage />)} />
          <Route path="/reservations/:id" element={guard(<ReservationPage />)} />
          <Route path="/messages" element={guard(<MessagesPage />)} />
          <Route path="/messages/:id" element={guard(<MessagesPage />)} />
          <Route path="/notifications" element={guard(<NotificationsPage />)} />
          <Route path="/org" element={guard(<OrganizationPage />)} />
          <Route path="/org/:id" element={<OrgPublicPage />} />
          <Route path="/admin" element={guard(<AdminPage />, true)} />
          <Route path="/impact" element={<ImpactPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
