import type { RouteObject } from 'react-router'
import { Navigate } from 'react-router'
import LoadingIndicator from './pages/components/LoadingIndicator'
import { ErrorPage } from './pages/ErrorPage'
import { HomePage } from './pages/HomePage'
import { paymentResultLoader } from './pages/PaymentResultPage'
import RegistrationEditPage from './pages/RegistrationEditPage'
import { RegistrationListPage } from './pages/RegistrationListPage'
import { SearchPage } from './pages/SearchPage'
import { StartListPage, startListLoader } from './pages/StartListPage'
import { SupportPage } from './pages/SupportPage'
import { TermsPage } from './pages/TermsPage'
import { Path } from './routeConfig'

const routes: RouteObject[] = [
  {
    children: [
      {
        element: <SearchPage />,
        index: true,
      },
      ...['event/:eventType/:id/:class/:date', 'event/:eventType/:id/:class', 'event/:eventType/:id'].map<RouteObject>(
        (path) => ({
          lazy: () => import('./pages/RegistrationCreatePage'),
          path,
        })
      ),
      {
        lazy: () => import('./pages/PaymentPage'),
        path: 'p/:id/:registrationId',
      },
      {
        element: <>loading...</>,
        loader: paymentResultLoader,
        path: 'p/success',
      },
      {
        element: <>loading...</>,
        loader: paymentResultLoader,
        path: 'p/cancel',
      },
      {
        element: <RegistrationListPage cancel />,
        path: 'r/:id/:registrationId/cancel',
      },
      {
        element: <RegistrationListPage confirm />,
        path: 'r/:id/:registrationId/confirm',
      },
      {
        element: <RegistrationEditPage />,
        path: 'r/:id/:registrationId/edit',
      },
      {
        element: <RegistrationListPage />,
        path: 'r/:id/:registrationId/saved',
      },
      {
        element: <RegistrationListPage />,
        path: 'r/:id/:registrationId',
      },
    ],
    element: <HomePage />,
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    path: '/',
  },
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: () => import('./pages/RegistrationInvitation'),
    path: 'r/:id/:registrationId/invitation',
  },
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: () => import('./pages/LoginPage'),
    path: Path.login,
  },
  { element: <Navigate to="/" replace />, errorElement: <ErrorPage />, path: Path.logout },
  {
    children: [
      {
        element: <Navigate to={Path.admin.index} replace />,
        index: true,
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventListPage')).default,
        }),
        path: Path.admin.events,
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventCreatePage')).default,
        }),
        path: Path.admin.newEvent,
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventEditPage')).default,
        }),
        path: Path.admin.editEvent(':id'),
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventViewPage')).default,
        }),
        path: Path.admin.viewEvent(':id'),
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/OrganizerListPage')).default,
        }),
        path: Path.admin.orgs,
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/OfficialListPage')).default,
        }),
        path: Path.admin.officials,
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/UsersPage')).default,
        }),
        path: Path.admin.users,
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/JudgeListPage')).default,
        }),
        path: Path.admin.judges,
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventTypeListPage')).default,
        }),
        path: Path.admin.eventTypes,
      },
      {
        lazy: async () => ({
          Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EmailTemplateListPage')).default,
        }),
        path: Path.admin.emailTemplates,
      },
    ],
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: async () => ({
      Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/AdminHomePage')).default,
    }),
    path: Path.admin.root,
  },
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: async () => ({
      Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/StartListPage')).default,
    }),
    path: Path.admin.startList(':id'),
  },
  {
    element: <StartListPage />,
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    loader: startListLoader,
    path: Path.startList(':id'),
  },
  {
    element: <SupportPage />,
    path: 'support',
  },
  {
    element: <TermsPage />,
    path: 'terms',
  },
  // Move users with old bookmarks to front page
  {
    element: <Navigate to="/" replace />,
    path: 'frmEtusivu.aspx',
  },
  {
    element: <Navigate to="/" replace />,
    path: 'frmKoekalenteri.aspx',
  },
  {
    element: <Navigate to="/" replace />,
    path: 'frmKalenteri.aspx',
  },
]

export default routes
