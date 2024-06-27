import type { RouteObject } from 'react-router-dom'

import { Navigate } from 'react-router-dom'

import { ErrorPage } from './pages/ErrorPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { paymentLoader, PaymentPage } from './pages/PaymentPage'
import { paymentResultLoader } from './pages/PaymentResultPage'
import RegistrationCreatePage from './pages/RegistrationCreatePage'
import RegistrationEditPage from './pages/RegistrationEditPage'
import { registrationInvitationLoader } from './pages/RegistrationInvitation'
import { RegistrationListPage } from './pages/RegistrationListPage'
import { SearchPage } from './pages/SearchPage'
import { startListLoader, StartListPage } from './pages/StartListPage'
import { SupportPage } from './pages/SupportPage'
import { TermsPage } from './pages/TermsPage'
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
      ...['event/:eventType/:id/:class/:date', 'event/:eventType/:id/:class', 'event/:eventType/:id'].map<RouteObject>(
        (path) => ({
          path,
          element: <RegistrationCreatePage />,
        })
      ),
      {
        path: 'p/:id/:registrationId',
        loader: paymentLoader,
        element: <PaymentPage />,
      },
      {
        path: 'p/success',
        loader: paymentResultLoader,
        element: <>loading...</>,
      },
      {
        path: 'p/cancel',
        loader: paymentResultLoader,
        element: <>loading...</>,
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
        path: 'r/:id/:registrationId/saved',
        element: <RegistrationListPage />,
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
    lazy: async () => ({
      Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/AdminHomePage')).default,
    }),
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <Navigate to={Path.admin.index} replace />,
      },
      {
        path: Path.admin.events,
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventListPage')).default,
        }),
      },
      {
        path: Path.admin.newEvent,
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventCreatePage')).default,
        }),
      },
      {
        path: Path.admin.editEvent(':id'),
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventEditPage')).default,
        }),
      },
      {
        path: Path.admin.viewEvent(':id'),
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventViewPage')).default,
        }),
      },
      {
        path: Path.admin.orgs,
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/OrganizerListPage')).default,
        }),
      },
      {
        path: Path.admin.officials,
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/OfficialListPage')).default,
        }),
      },
      {
        path: Path.admin.users,
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/UsersPage')).default,
        }),
      },
      {
        path: Path.admin.judges,
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/JudgeListPage')).default,
        }),
      },
      {
        path: Path.admin.eventTypes,
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventTypeListPage')).default,
        }),
      },
      {
        path: Path.admin.emailTemplates,
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EmailTemplateListPage')).default,
        }),
      },
    ],
  },
  {
    path: Path.admin.startList(':id'),
    lazy: async () => ({
      Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/AdminStartListPage')).default,
    }),
    errorElement: <ErrorPage />,
  },
  {
    path: Path.startList(':id'),
    loader: startListLoader,
    element: <StartListPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: 'support',
    element: <SupportPage />,
  },
  {
    path: 'terms',
    element: <TermsPage />,
  },
  // Move users with old bookmarks to front page
  {
    path: 'frmEtusivu.aspx',
    element: <Navigate to="/" replace />,
  },
  {
    path: 'frmKoekalenteri.aspx',
    element: <Navigate to="/" replace />,
  },
  {
    path: 'frmKalenteri.aspx',
    element: <Navigate to="/" replace />,
  },
]

export default routes
