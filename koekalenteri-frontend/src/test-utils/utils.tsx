import { createMemoryRouter, createRoutesFromElements, RouteObject, RouterProvider } from "react-router-dom";
import { RouterInit } from '@remix-run/router';
import { prettyDOM } from "@testing-library/react";

/**
 * Abstraction to avoid re-writing all tests for the time being
 * @see https://github.com/remix-run/react-router/blob/main/packages/react-router/__tests__/data-memory-router-test.tsx
*/
export function DataMemoryRouter({
  basename,
  children,
  fallbackElement,
  hydrationData,
  initialEntries,
  initialIndex,
  routes,
}: {
  basename?: RouterInit["basename"];
  children?: React.ReactNode | React.ReactNode[];
  fallbackElement?: React.ReactNode;
  hydrationData?: RouterInit["hydrationData"];
  initialEntries?: string[];
  initialIndex?: number;
  routes?: RouteObject[];
}) {
  const router = createMemoryRouter(routes || createRoutesFromElements(children), {
    basename,
    hydrationData,
    initialEntries,
    initialIndex,
  });
  return <RouterProvider router={router} fallbackElement={fallbackElement} />;
}

export function getHtml(container: HTMLElement) {
  return prettyDOM(container, undefined, {
    highlight: false,
  });
}
