import { lazy } from 'react'
import { Navigate, RouteObject } from 'react-router-dom'

import { ErrorPage } from './pages/ErrorPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import RegistrationCreatePage from './pages/RegistrationCreatePage'
import RegistrationEditPage from './pages/RegistrationEditPage'
import { RegistrationListPage } from './pages/RegistrationListPage'
import { SearchPage } from './pages/SearchPage'
import { Path } from './routeConfig'

// lazy load admin section
const AdminHomePage = lazy(() => import('./pages/admin/AdminHomePage'))
const AdminStartListPage = lazy(() => import('./pages/admin/AdminStartListPage'))
const EmailTemplateListPage = lazy(() => import('./pages/admin/EmailTemplateListPage'))
const EventCreatePage = lazy(() => import('./pages/admin/EventCreatePage'))
const EventEditPage = lazy(() => import('./pages/admin/EventEditPage'))
const EventListPage = lazy(() => import('./pages/admin/EventListPage'))
const EventTypeListPage = lazy(() => import('./pages/admin/EventTypeListPage'))
const EventViewPage = lazy(() => import('./pages/admin/EventViewPage'))
const JudgeListPage = lazy(() => import('./pages/admin/JudgeListPage'))
const OfficialListPage = lazy(() => import('./pages/admin/OfficialListPage'))
const OrganizerListPage = lazy(() => import('./pages/admin/OrganizerListPage'))
const UsersPage = lazy(() => import('./pages/admin/UsersPage'))

const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <SearchPage />,
      },
      ...['event/:eventType/:id/:class/:date', 'event/:eventType/:id/:class', 'event/:eventType/:id'].map<RouteObject>(
        (path) => ({
          path,
          element: <RegistrationCreatePage />,
        })
      ),
      {
        path: 'r/:id/:registrationId/cancel',
        element: <RegistrationListPage cancel />,
      },
      {
        path: 'r/:id/:registrationId/confirm',
        element: <RegistrationListPage confirm />,
      },
      {
        path: 'r/:id/:registrationId/edit',
        element: <RegistrationEditPage />,
      },
      {
        path: 'r/:id/:registrationId',
        element: <RegistrationListPage />,
      },
    ],
  },
  { path: Path.login, element: <LoginPage /> },
  { path: Path.logout, element: <Navigate to="/" replace /> },
  {
    path: Path.admin.root,
    element: <AdminHomePage />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <Navigate to={Path.admin.index} replace />,
      },
      {
        path: Path.admin.events,
        element: <EventListPage />,
      },
      {
        path: Path.admin.newEvent,
        element: <EventCreatePage />,
      },
      {
        path: Path.admin.editEvent(':id'),
        element: <EventEditPage />,
      },
      {
        path: Path.admin.viewEvent(':id'),
        element: <EventViewPage />,
      },
      {
        path: Path.admin.orgs,
        element: <OrganizerListPage />,
      },
      {
        path: Path.admin.officials,
        element: <OfficialListPage />,
      },
      {
        path: Path.admin.users,
        element: <UsersPage />,
      },
      {
        path: Path.admin.judges,
        element: <JudgeListPage />,
      },
      {
        path: Path.admin.eventTypes,
        element: <EventTypeListPage />,
      },
      {
        path: Path.admin.emailTemplates,
        element: <EmailTemplateListPage />,
      },
    ],
  },
  {
    path: Path.admin.startList(':id'),
    element: <AdminStartListPage />,
  },
]

export default routes
