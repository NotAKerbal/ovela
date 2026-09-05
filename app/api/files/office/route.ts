import { launchOffice } from "@/lib/office-launch";
export async function POST(request: Request) { return launchOffice(request); }
