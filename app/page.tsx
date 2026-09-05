import { Haven } from '@/components/haven';
import { AuthGate } from '@/components/auth-gate';
export default function Home() { return <AuthGate><Haven /></AuthGate>; }
