import type { Route } from "next";

/**
 * Typed route builders.
 *
 * Next's typedRoutes only accepts string literals, so every dynamic href needs
 * a cast. Doing that inline scatters casts through the components and quietly
 * disables link checking; keeping them here means one place to audit, and
 * renaming a route is a single grep.
 */
export const routes = {
  dashboard: "/dashboard" as Route,
  matrix: "/matrix" as Route,
  signOffs: "/signoff" as Route,
  people: "/people" as Route,
  machines: "/machines" as Route,
  documents: "/documents" as Route,
  newDocument: "/documents/new" as Route,
  login: "/login" as Route,

  person: (id: string) => `/people/${id}` as Route,
  machine: (id: string) => `/machines/${id}` as Route,
  document: (id: string) => `/documents/${id}` as Route,
  editRevision: (documentId: string, revisionId: string) =>
    `/documents/${documentId}/edit/${revisionId}` as Route,
  competence: (id: string) => `/competence/${id}` as Route,
  captureSignOff: (sessionId: string) => `/signoff/${sessionId}` as Route,
  attachment: (id: string) => `/api/attachments/${id}`,
} as const;
