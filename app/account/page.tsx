import { AuthGate } from '@/components/auth-gate';
import { Account } from '@/components/account';
export default function Page() { return <AuthGate><Account /></AuthGate>; }
