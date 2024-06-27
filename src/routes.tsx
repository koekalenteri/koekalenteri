import type { RouteObject } from 'react-router-dom'

import { lazy } from 'react'
import { Navigate } from 'react-router-dom'

import { isDevEnv } from './lib/env'
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

// lazy load admin section
const AdminHomePage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/AdminHomePage'))
const AdminStartListPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/AdminStartListPage'))
const EmailTemplateListPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/EmailTemplateListPage'))
const EventCreatePage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/EventCreatePage'))
const EventEditPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/EventEditPage'))
const EventListPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/EventListPage'))
const EventTypeListPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/EventTypeListPage'))
const EventViewPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/EventViewPage'))
const JudgeListPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/JudgeListPage'))
const OfficialListPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/OfficialListPage'))
const OrganizerListPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/OrganizerListPage'))
const UsersPage = lazy(() => import(/* webpackChunkName: "admin" */ './pages/admin/UsersPage'))

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
    element: <AdminHomePage />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <Navigate to={Path.admin.index} replace />,
      },
      {
        path: Path.admin.events,
        element: <EventListPage isDev={isDevEnv()} />,
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
