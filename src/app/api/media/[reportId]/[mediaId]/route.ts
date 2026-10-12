import { fail, handle } from "@/lib/api";
import { requireReviewerApi } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getMediaStore } from "@/lib/storage";

/**
 * Private media. Photos and voice notes are never public: this route checks the session first, then
 * streams the file. Reporters' faces and EXIF GPS never leave the reviewer side.
 */
export const GET = (_request: Request, ctx: RouteContext<"/api/media/[reportId]/[mediaId]">) =>
  handle(async () => {
    await requireReviewerApi();
    const { reportId, mediaId } = await ctx.params;

    const report = await getDb().reports.get(reportId);
    const item = report?.media.find((m) => m.id === mediaId);
    if (!item) return fail(404, "That attachment does not exist.");

    const data = await getMediaStore().get(item.storagePath);
    if (!data) return fail(404, "That attachment could not be found in storage.");

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": item.mimeType,
        "Content-Length": String(data.length),
        // Private, and never cached by a shared proxy.
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${item.id}"`,
      },
    });
  });
