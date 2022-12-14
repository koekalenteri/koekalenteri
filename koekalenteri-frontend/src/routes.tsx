import { Navigate, RouteObject } from 'react-router-dom';
import { ADMIN_EDIT_EVENT, ADMIN_EVENTS, ADMIN_EVENT_TYPES, ADMIN_JUDGES, ADMIN_NEW_EVENT, ADMIN_OFFICIALS, ADMIN_ORGS, ADMIN_ROOT, ADMIN_USERS, ADMIN_VIEW_EVENT } from './config';
import { AdminHomePage, ErrorPage, EventEditPage, EventListPage, EventTypeListPage, EventViewPageWithData, HomePage, JudgeListPage, LoginPage, LogoutPage, OfficialListPage, OrganizerListPage, RegistrationListPage, RegistrationPage, SearchPage, UsersPage } from './pages';
import { stores } from './stores';
import { deserializeFilter } from './components';

const routes: RouteObject[] = [
  {
    path: "/",
    element: <HomePage />,
    errorElement: <ErrorPage />,
    loader: async({request}) => {
      stores.rootStore.load(request.signal);
      stores.publicStore.initialize(request.signal);
      return true;
    },
    shouldRevalidate: () => !stores.rootStore.loaded,
    children: [
      {
        index: true,
        element: <SearchPage />,
        loader: async({request}) => {
          const url = new URL(request.url);
          stores.publicStore.setFilter(deserializeFilter(url.searchParams));
        }
      },
      ...[
        "event/:eventType/:id/:class/:date",
        "event/:eventType/:id/:class",
        "event/:eventType/:id",
      ].map<RouteObject>(path => ({
        path,
        element: <RegistrationPage />,
        loader: async({request, params}) => stores.publicStore.selectEvent(params.id, request.signal),
      })),
      {
        path: "registration/:eventType/:id/:registrationId/cancel",
        element: <RegistrationListPage cancel />
      },
      {
        path: "registration/:eventType/:id/:registrationId/edit",
        element: <RegistrationPage />
      },
      {
        path: "registration/:eventType/:id/:registrationId",
        element: <RegistrationListPage />
      },
    ]
  },
  {path: "/login", element: <LoginPage />},
  {path: "/logout", element: <LogoutPage />},
  {
    path: ADMIN_ROOT,
    element: <AdminHomePage />,
    errorElement: <ErrorPage />,
    loader: async({request}) => {
      stores.rootStore.load(request.signal);
      stores.privateStore.load(request.signal);
      return true;
    },
    shouldRevalidate: () => !stores.rootStore.loaded,
    children: [
      {
        index: true,
        element: <Navigate to={ADMIN_EVENTS} replace />
      },
      {
        path: ADMIN_EVENTS,
        element: <EventListPage />
      },
      {
        path: ADMIN_NEW_EVENT,
        element: <EventEditPage create />
      },
      {
        path: `${ADMIN_EDIT_EVENT}/:id`,
        element: <EventEditPage />
      },
      {
        path: `${ADMIN_VIEW_EVENT}/:id`,
        element: <EventViewPageWithData />,
        loader: async({request, params}) => stores.privateStore.selectEvent(params.id, request.signal),
      },
      {
        path: `${ADMIN_VIEW_EVENT}/:id/:reistrationId`,
        element: <EventViewPageWithData />
      },
      {
        path: ADMIN_ORGS,
        element: <OrganizerListPage />
      },
      {
        path: ADMIN_OFFICIALS,
        element: <OfficialListPage />
      },
      {
        path: ADMIN_USERS,
        element: <UsersPage />
      },
      {
        path: ADMIN_JUDGES,
        element: <JudgeListPage />
      },
      {
        path: ADMIN_EVENT_TYPES,
        element: <EventTypeListPage />
      },
    ]
  }
]

export default routes
