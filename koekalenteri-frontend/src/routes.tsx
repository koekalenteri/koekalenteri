import { Navigate, RouteObject } from 'react-router-dom'

import AdminHomePage from './pages/admin/AdminHomePage'
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
import RegistrationCreatePage from './pages/RegistrationCreatePage'
import RegistrationEditPage from './pages/RegistrationEditPage'
import { RegistrationListPage } from './pages/RegistrationListPage'
import { SearchPage } from './pages/SearchPage'
import { Path } from './routeConfig'

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
      ...[
        'event/:eventType/:id/:class/:date',
        'event/:eventType/:id/:class',
        'event/:eventType/:id',
      ].map<RouteObject>(path => ({
        path,
        element: <RegistrationCreatePage />,
      })),
      {
        path: 'registration/:eventType/:id/:registrationId/cancel',
        element: <RegistrationListPage cancel />,
      },
      {
        path: 'registration/:eventType/:id/:registrationId/edit',
        element: <RegistrationEditPage />,
      },
      {
        path: 'registration/:eventType/:id/:registrationId',
        element: <RegistrationListPage />,
      },
    ],
  },
  {path: Path.login, element: <LoginPage />},
  {path: Path.logout, element: <Navigate to='/' />},
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
]

export default routes
