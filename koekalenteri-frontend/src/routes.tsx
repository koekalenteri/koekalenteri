import type { RouteObject } from 'react-router-dom'

import { Navigate } from 'react-router-dom'

import AdminHomePage from './pages/admin/AdminHomePage'
import AdminStartListPage from './pages/admin/AdminStartListPage'
import EmailTemplateListPage from './pages/admin/EmailTemplateListPage'
import EventCreatePage from './pages/admin/EventCreatePage'
import EventEditPage from './pages/admin/EventEditPage'
import EventListPage from './pages/admin/EventListPage'
import EventTypeListPage from './pages/admin/EventTypeListPage'
import EventViewPage from './pages/admin/EventViewPage'
import JudgeListPage from './pages/admin/JudgeListPage'
import OfficialListPage from './pages/admin/OfficialListPage'
import OrganizerListPage from './pages/admin/OrganizerListPage'
import UsersPage from './pages/admin/UsersPage'
import { ErrorPage } from './pages/ErrorPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { paymentLoader } from './pages/PaymentPage'
import RegistrationCreatePage from './pages/RegistrationCreatePage'
import RegistrationEditPage from './pages/RegistrationEditPage'
import { registrationInvitationLoader } from './pages/RegistrationInvitation'
import { RegistrationListPage } from './pages/RegistrationListPage'
import { SearchPage } from './pages/SearchPage'
import { startListLoader, StartListPage } from './pages/StartListPage'
import { Path } from './routeConfig'

/* TBI: does not work in production build (probably due to @aws-amplify/ui-react)
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
*/

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
        path: 'p/:id/:registrationId',
        loader: paymentLoader,
        element: <div>This is da maksusivu</div>,
      },
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
        path: 'r/:id/:registrationId/invitation',
        loader: registrationInvitationLoader,
        element: <>loading...</>,
      },
      {
        path: 'r/:id/:registrationId',
        element: <RegistrationListPage />,
      },
    ],
  },
  { path: Path.login, element: <LoginPage />, errorElement: <ErrorPage /> },
  { path: Path.logout, element: <Navigate to="/" replace />, errorElement: <ErrorPage /> },
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
    errorElement: <ErrorPage />,
  },
  {
    path: Path.startList(':id'),
    loader: startListLoader,
    element: <StartListPage />,
    errorElement: <ErrorPage />,
  },
]

export default routes
