import { Suspense } from "react";
import { AuthGate, PageSkeleton } from "@/components/auth-gate";
import { FilesAccess } from "@/components/files/workspace";
export default function Page() {
  return (
    <AuthGate>
      <Suspense fallback={<PageSkeleton />}>
        <FilesAccess />
      </Suspense>
    </AuthGate>
  );
}
