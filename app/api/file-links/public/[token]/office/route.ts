import { launchOffice } from '@/lib/office-launch';
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  return launchOffice(request, (await context.params).token);
}
