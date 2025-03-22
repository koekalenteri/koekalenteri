import type { RouteObject } from 'react-router'

import { Navigate } from 'react-router'

import LoadingIndicator from './pages/components/LoadingIndicator'
import { ErrorPage } from './pages/ErrorPage'
import { HomePage } from './pages/HomePage'
import { paymentResultLoader } from './pages/PaymentResultPage'
import RegistrationEditPage from './pages/RegistrationEditPage'
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
          lazy: () => import('./pages/RegistrationCreatePage'),
          hydrateFallbackElement: <LoadingIndicator />,
        })
      ),
      {
        path: 'p/:id/:registrationId',
        lazy: () => import('./pages/PaymentPage'),
        hydrateFallbackElement: <LoadingIndicator />,
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
        path: 'r/:id/:registrationId/saved',
        element: <RegistrationListPage />,
      },
      {
        path: 'r/:id/:registrationId',
        element: <RegistrationListPage />,
      },
    ],
  },
  {
    path: 'r/:id/:registrationId/invitation',
    lazy: () => import('./pages/RegistrationInvitation'),
    hydrateFallbackElement: <LoadingIndicator />,
    errorElement: <ErrorPage />,
  },
  {
    path: Path.login,
    lazy: () => import('./pages/LoginPage'),
    hydrateFallbackElement: <LoadingIndicator />,
    errorElement: <ErrorPage />,
  },
  { path: Path.logout, element: <Navigate to="/" replace />, errorElement: <ErrorPage /> },
  {
    path: Path.admin.root,
    lazy: async () => ({
      Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/AdminHomePage')).default,
    }),
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
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
      Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/StartListPage')).default,
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
