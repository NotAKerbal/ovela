import { api } from "@/convex/_generated/api";
import { officeAccess } from "@/lib/files-office";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const session = await officeAccess(request, id);
    return Response.json(
      {
        BaseFileName: session.file.name,
        Size: session.file.size,
        Version: String(session.file.revision),
        OwnerId: session.file.ownerId,
        UserId: session.userId,
        UserFriendlyName: session.name,
        UserCanWrite: session.canEdit,
        ReadOnly: !session.canEdit,
        SupportsUpdate: true,
        SupportsLocks: true,
        SupportsGetLock: true,
        UserCanNotWriteRelative: true,
        SupportsRename: false,
        EnableOwnerTermination: false,
        HideUserList: "true",
        PostMessageOrigin: new URL(process.env.SITE_URL ?? request.url).origin,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return new Response(null, { status: 401 });
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const session = await officeAccess(request, id);
    const operation = request.headers.get("x-wopi-override");
    if (
      operation !== "LOCK" &&
      operation !== "UNLOCK" &&
      operation !== "REFRESH_LOCK" &&
      operation !== "GET_LOCK"
    )
      return new Response(null, { status: 501 });
    if (!session.canEdit) return new Response(null, { status: 403 });
    const value = request.headers.get("x-wopi-lock") ?? "";
    if (operation !== "GET_LOCK" && !value)
      return new Response(null, { status: 400 });
    const result = await session.client.mutation(api.filesOffice.lock, {
      fileId: session.fileId,
      token: session.token,
      operation,
      value,
      oldValue: request.headers.get("x-wopi-oldlock") ?? undefined,
    });
    return new Response(null, {
      status: result.ok ? 200 : 409,
      headers: { "X-WOPI-Lock": result.value },
    });
  } catch {
    return new Response(null, { status: 401 });
  }
}
