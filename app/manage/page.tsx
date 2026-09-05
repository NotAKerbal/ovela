import { AuthGate } from '@/components/auth-gate';
import { Management } from '@/components/management';
export default function Page() { return <AuthGate admin><Management /></AuthGate>; }
