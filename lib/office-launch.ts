import { boundedBody } from "@/lib/files-storage";
import { randomBytes } from "node:crypto";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { filesClient, getFile, filesSecret } from "@/lib/files-server";
import { officeClient } from "@/lib/files-office";
import { verifyLinkUnlock, hashLinkToken } from "@/lib/file-links";
import { discoveryAction } from "@/lib/office-discovery";

export async function launchOffice(request: Request, routeShareToken?: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(process.env.SITE_URL ?? request.url).origin)
    return new Response(null, { status: 403 });
  const office = process.env.COLLABORA_URL;
  if (!office)
    return Response.json(
      {
        error:
          "Office editing is not enabled. Start Ovela with the office service.",
      },
      { status: 503 },
    );
  try {
    const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096)));
    const fileId = body.fileId, shareToken = routeShareToken ?? body.shareToken;
    if (typeof fileId !== "string")
      return Response.json({ error: "Choose a document." }, { status: 400 });
    if (shareToken !== undefined && typeof shareToken !== "string") return new Response(null, { status: 400 });
    const shared = typeof shareToken === "string" ? { secret: filesSecret(), tokenHash: hashLinkToken(shareToken), unlocked: await verifyLinkUnlock(request, shareToken) } : null;
    const client = shared ? officeClient() : await filesClient();
    const file = shared
      ? await client.query(api.fileLinks.content, { ...shared, id: fileId as Id<"files"> })
      : await getFile(fileId);
    const discovery = await fetch(
      `${(process.env.COLLABORA_INTERNAL_URL ?? office).replace(/\/$/, "")}/hosting/discovery`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!discovery.ok)
      throw new Error("Office is starting. Try again shortly.");
    const action = new URL(
      discoveryAction(
        await discovery.text(),
        file.name.split(".").pop()!.toLowerCase(),
        file.canEdit,
      ),
    );
    const publicOffice = new URL(office);
    action.protocol = publicOffice.protocol;
    action.host = publicOffice.host;
    const callback = (
      process.env.OVELA_WOPI_URL ??
      process.env.SITE_URL ??
      new URL(request.url).origin
    ).replace(/\/$/, "");
    action.searchParams.set("WOPISrc", `${callback}/api/files/wopi/${fileId}`);
    action.searchParams.set("lang", "en-US");
    action.searchParams.set("closebutton", "0");
    const token = randomBytes(32).toString("hex");
    const { expiresAt } = shared
      ? await client.mutation(api.filesOffice.createShared, { ...shared, fileId: fileId as Id<"files">, token })
      : await client.mutation(api.filesOffice.create, { fileId: fileId as Id<"files">, token });
    return Response.json(
      { url: action.toString(), token, expiresAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("PAYLOAD_TOO_LARGE")) return Response.json({ error: "Request is too large." }, { status: 413 });
    if (error instanceof Error && error.message.includes("SHARE_LOCKED")) return Response.json({ error: "Unlock this shared link before opening its office document." }, { status: 401 });
    return Response.json(
      {
        error:
          "The office editor could not open this file. Check your access and that the office service is running.",
      },
      { status: 503 },
    );
  }
}
