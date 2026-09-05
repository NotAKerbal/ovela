import type { Metadata } from "next";
import { SharedFiles } from "@/components/files/shared-files";
export const metadata: Metadata = {
  title: "Shared files · Ovela",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedFiles token={token} />;
}
