/**
 * /calendar — direct URL route to the Holiday Calendar tab.
 *
 * AppShell is mounted as a global wrapper (in layout.tsx) and decides which
 * tab to render based on its own `activeTab` state, which it now syncs with
 * the URL pathname. This page itself renders nothing — AppShell handles the
 * actual content. The route exists purely so the Calendar is a shareable,
 * bookmarkable URL.
 */
export default function CalendarPage() {
  return null;
}
