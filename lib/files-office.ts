import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function officeClient() {
  return new ConvexHttpClient(
    process.env.CONVEX_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL!,
  );
}
export async function officeAccess(request: Request, id: string) {
  const token = new URL(request.url).searchParams.get("access_token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid office session.");
  const fileId = id as Id<"files">;
  const client = officeClient();
  const session = await client.query(api.filesOffice.inspect, {
    fileId,
    token,
  });
  return { ...session, client, token, fileId };
}
