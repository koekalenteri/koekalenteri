import type { RouteObject } from 'react-router'
import type { RegistrationListPageProps } from './pages/RegistrationListPage'
import { Navigate, redirect } from 'react-router'
import { reloadOnChunkLoadError } from './lib/client/lazy'
import LoadingIndicator from './pages/components/LoadingIndicator'
import { ErrorPage } from './pages/ErrorPage'
import { HomePage } from './pages/HomePage'
import { paymentResultLoader } from './pages/PaymentResultPage'
import { SearchPage } from './pages/SearchPage'
import { Path } from './routeConfig'

/**
 * The registration views are the same page in four shapes, so the chunk is shared and only the
 * props differ. Loading it on navigation keeps the data grid and the whole form tree -- with
 * mui-tel-input -- out of the first load of the public calendar.
 */
const registrationListPage = (props: RegistrationListPageProps = {}): RouteObject['lazy'] =>
  function loadRegistrationListPage() {
    return reloadOnChunkLoadError(async () => {
      const { RegistrationListPage } = await import('./pages/RegistrationListPage')

      return { Component: () => <RegistrationListPage {...props} /> }
    })
  }

const routes: RouteObject[] = [
  {
    children: [
      {
        element: <SearchPage />,
        index: true,
      },
      ...['event/:eventType/:id/:class/:date', 'event/:eventType/:id/:class', 'event/:eventType/:id'].map<RouteObject>(
        (path) => ({
          lazy: () => reloadOnChunkLoadError(() => import('./pages/RegistrationCreatePage')),
          path,
        })
      ),
      {
        lazy: () => reloadOnChunkLoadError(() => import('./pages/LiveEntryPage')),
        path: 'live-entry/:eventId/:stationId/access/:token',
      },
      {
        lazy: () => reloadOnChunkLoadError(() => import('./pages/ClassStartNumbersPage')),
        path: 'start-numbers/:eventId/:eventClass/access/:token',
      },
      {
        // Links already handed to a judge's secretary keep working under the name the view had before.
        loader: ({ params }) =>
          redirect(Path.liveEntry(params.eventId ?? '', params.stationId ?? '', params.token ?? '')),
        path: 'station/:eventId/:stationId/access/:token',
      },
      {
        lazy: () => reloadOnChunkLoadError(() => import('./pages/PaymentPage')),
        path: 'p/:id/:registrationId',
      },
      {
        lazy: () => reloadOnChunkLoadError(() => import('./pages/PaymentPage')),
        path: 'p/:id/:registrationId/access/:editToken',
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
        lazy: registrationListPage({ cancel: true }),
        path: 'r/:id/:registrationId/cancel',
      },
      {
        lazy: registrationListPage({ cancel: true }),
        path: 'r/:id/:registrationId/access/:editToken/cancel',
      },
      {
        lazy: registrationListPage({ confirm: true }),
        path: 'r/:id/:registrationId/confirm',
      },
      {
        lazy: registrationListPage({ confirm: true }),
        path: 'r/:id/:registrationId/access/:editToken/confirm',
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import('./pages/RegistrationEditPage')).default,
          })),
        path: 'r/:id/:registrationId/edit',
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import('./pages/RegistrationEditPage')).default,
          })),
        path: 'r/:id/:registrationId/access/:editToken/edit',
      },
      {
        lazy: registrationListPage(),
        path: 'r/:id/:registrationId/saved',
      },
      {
        lazy: registrationListPage(),
        path: 'r/:id/:registrationId/access/:editToken/saved',
      },
      {
        lazy: registrationListPage(),
        path: 'r/:id/:registrationId',
      },
      {
        lazy: registrationListPage(),
        path: 'r/:id/:registrationId/access/:editToken',
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
    lazy: () => reloadOnChunkLoadError(() => import('./pages/RegistrationInvitation')),
    path: 'r/:id/:registrationId/invitation',
  },
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: () => reloadOnChunkLoadError(() => import('./pages/RegistrationInvitation')),
    path: 'r/:id/:registrationId/access/:editToken/invitation',
  },
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: () => reloadOnChunkLoadError(() => import('./pages/LoginPage')),
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
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventListPage')).default,
          })),
        path: Path.admin.events,
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventCreatePage')).default,
          })),
        path: Path.admin.newEvent,
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventEditPage')).default,
          })),
        path: Path.admin.editEvent(':id'),
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventViewPage')).default,
          })),
        path: Path.admin.viewEvent(':id'),
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventStationsPage')).default,
          })),
        path: Path.admin.stations(':id'),
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventStartNumbersPage')).default,
          })),
        path: Path.admin.startNumbers(':id'),
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventResultsPage')).default,
          })),
        path: Path.admin.results(':id'),
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/StationResultsPage')).default,
          })),
        path: Path.admin.stationResults(':id', ':stationId'),
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/OrganizerListPage')).default,
          })),
        path: Path.admin.orgs,
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/OfficialListPage')).default,
          })),
        path: Path.admin.officials,
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/UsersPage')).default,
          })),
        path: Path.admin.users,
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/JudgeListPage')).default,
          })),
        path: Path.admin.judges,
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventTypeListPage')).default,
          })),
        path: Path.admin.eventTypes,
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EmailTemplateListPage')).default,
          })),
        path: Path.admin.emailTemplates,
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/OrganizerStatsPage')).default,
          })),
        path: Path.admin.stats,
      },
      {
        lazy: () =>
          reloadOnChunkLoadError(async () => ({
            Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/EventBreakdownPage')).default,
          })),
        path: Path.admin.eventBreakdown,
      },
    ],
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: () =>
      reloadOnChunkLoadError(async () => ({
        Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/AdminHomePage')).default,
      })),
    path: Path.admin.root,
  },
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: () =>
      reloadOnChunkLoadError(async () => ({
        Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/StartListPage')).default,
      })),
    path: Path.admin.startList(':id'),
  },
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: () =>
      reloadOnChunkLoadError(async () => ({
        Component: (await import(/* webpackChunkName: "admin" */ './pages/admin/StartListPreviewPage')).default,
      })),
    path: Path.admin.startListPreview(':id'),
  },
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: () =>
      reloadOnChunkLoadError(async () => {
        const { StartListPage, startListLoader } = await import('./pages/StartListPage')

        return { Component: StartListPage, loader: startListLoader }
      }),
    path: Path.startList(':id'),
  },
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <LoadingIndicator />,
    lazy: () => reloadOnChunkLoadError(() => import('./pages/StatsPage')),
    path: Path.stats,
  },
  {
    lazy: () =>
      reloadOnChunkLoadError(async () => ({
        Component: (await import(/* webpackChunkName: "docs" */ './pages/DocsIndexPage')).DocsIndexPage,
      })),
    path: Path.docs,
  },
  {
    lazy: () =>
      reloadOnChunkLoadError(async () => ({
        Component: (await import(/* webpackChunkName: "docs" */ './pages/DocsPage')).DocsPage,
      })),
    path: Path.docsPage(),
  },
  {
    lazy: () =>
      reloadOnChunkLoadError(async () => ({
        Component: (await import(/* webpackChunkName: "docs" */ './pages/WhatsNewPage')).WhatsNewPage,
      })),
    path: Path.whatsNew,
  },
  {
    lazy: () => reloadOnChunkLoadError(async () => ({ Component: (await import('./pages/SupportPage')).SupportPage })),
    path: 'support',
  },
  {
    lazy: () => reloadOnChunkLoadError(async () => ({ Component: (await import('./pages/TermsPage')).TermsPage })),
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
