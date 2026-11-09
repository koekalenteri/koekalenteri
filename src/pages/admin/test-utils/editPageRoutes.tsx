import type { DogEvent } from '@/types'
import { Link, Outlet } from 'react-router'
import { Path } from '@/routeConfig'
import { flushPromises } from '@/test-utils/utils'
import EventEditPage from '../EventEditPage'
import { adminEventRegistrationsAtom } from '../state'
import { renderAdminRoutes } from './adminRoutes'

/**
 * The event's edit page under a layout with a `menu` link to `/elsewhere`, the way the side menu leads
 * off the page, and the event list a save or a cancel goes to. The event has no registrations.
 */
export const renderEditPage = async (event: DogEvent) => {
  const rendered = await renderAdminRoutes({
    events: [event],
    initialEntry: Path.admin.editEvent(event.id),
    initializeState: ({ set }) => set(adminEventRegistrationsAtom(event.id), []),
    routes: [
      {
        children: [
          { element: <EventEditPage />, path: Path.admin.editEvent() },
          { element: <div>event list</div>, path: Path.admin.events },
          { element: <div>elsewhere</div>, path: '/elsewhere' },
        ],
        element: (
          <>
            <Link to="/elsewhere">menu</Link>
            <Outlet />
          </>
        ),
      },
    ],
  })
  await flushPromises()
  return rendered
}
