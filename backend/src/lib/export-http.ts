import type { Context } from "hono";
import { AuthError } from "@backend/lib/errors";
import {
  buildExport, isExportFormat, EXPORT_ROW_CAP, type ExportSpec,
} from "@backend/services/export";

/**
 * Turn a list endpoint into an export when `?format=` is present.
 *
 * A route adds export support with three lines:
 *
 *   const file = await exportIfRequested(c, DOCK_EVENTS_EXPORT, (take) =>
 *     prisma.dockEvent.findMany({ where, include, orderBy, take }));
 *   if (file) return file;
 *
 * `where` is the same object the paginated branch uses, which is the point:
 * the permission check, the tenant scope and every filter have already been
 * applied by the time this runs, so an export cannot return rows the caller
 * could not see on screen.
 */
export async function exportIfRequested<T>(
  c: Context,
  spec: ExportSpec<T>,
  /**
   * Fetch the rows to export. `take` must be passed straight to the query: it
   * is the cap plus one, so a too-large result is detected without ever holding
   * an unbounded number of rows in memory.
   */
  fetchAll: (take: number) => Promise<T[]>,
): Promise<Response | null> {
  const format = c.req.query("format");
  if (!format) return null;

  if (!isExportFormat(format)) {
    throw new AuthError(`Unknown export format "${format}". Use csv, xlsx or pdf.`, 422);
  }

  const rows = await fetchAll(EXPORT_ROW_CAP + 1);
  const file = await buildExport(format, spec, rows);

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      // The quoted filename is what the browser saves it as.
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Content-Length": String(file.body.length),
      // These are tenant-scoped business records; no shared cache should hold
      // one, and a browser re-requesting after a filter change must not reuse it.
      "Cache-Control": "no-store",
    },
  });
}
