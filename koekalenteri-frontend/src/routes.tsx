import { Navigate, RouteObject } from 'react-router-dom'

import { deserializeFilter } from './components'
import { AdminHomePage, ErrorPage, EventEditPage, EventListPage, EventTypeListPage, EventViewPage, HomePage, JudgeListPage, LoginPage, LogoutPage, OfficialListPage, OrganizerListPage, RegistrationListPage, RegistrationPage, SearchPage, UsersPage } from './pages'
import { Path } from './routeConfig'
import { stores } from './stores'

const routes: RouteObject[] = [
  {
    path: "/",
    element: <HomePage />,
    errorElement: <ErrorPage />,
    loader: async({request}) => {
      stores.rootStore.load(request.signal)
      stores.publicStore.initialize(request.signal)
      return true
    },
    shouldRevalidate: () => !stores.rootStore.loaded,
    children: [
      {
        index: true,
        element: <SearchPage />,
        loader: async({request}) => {
          const url = new URL(request.url)
          stores.publicStore.setFilter(deserializeFilter(url.searchParams))
          return null
        },
      },
      ...[
        "event/:eventType/:id/:class/:date",
        "event/:eventType/:id/:class",
        "event/:eventType/:id",
      ].map<RouteObject>(path => ({
        path,
        element: <RegistrationPage />,
        loader: async({request, params}) => {
          stores.publicStore.selectEvent(params.id, request.signal)
          return null
        },
      })),
      {
        path: "registration/:eventType/:id/:registrationId/cancel",
        element: <RegistrationListPage cancel />,
      },
      {
        path: "registration/:eventType/:id/:registrationId/edit",
        element: <RegistrationPage />,
      },
      {
        path: "registration/:eventType/:id/:registrationId",
        element: <RegistrationListPage />,
      },
    ],
  },
  {path: Path.login, element: <LoginPage />},
  {path: Path.logout, element: <LogoutPage />},
  {
    path: Path.admin.root,
    element: <AdminHomePage />,
    errorElement: <ErrorPage />,
    loader: async({request}) => {
      stores.rootStore.load(request.signal)
      stores.privateStore.load(request.signal)
      return true
    },
    shouldRevalidate: () => !stores.rootStore.loaded,
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
        element: <EventEditPage create />,
      },
      {
        path: `${Path.admin.editEvent}/:id`,
        element: <EventEditPage />,
      },
      {
        path: `${Path.admin.viewEvent}/:id`,
        element: <EventViewPage />,
        loader: async({request, params}) => {

          stores.privateStore.selectEvent(params.id, request.signal)
          return null
        },
      },
      {
        path: `${Path.admin.viewEvent}/:id/:reistrationId`,
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
    ],
  },
]

export default routes
