import { redirect } from '@sveltejs/kit';
import { ovelaHome } from '$lib/managers/ovela-profile.svelte';
export const load = () => { redirect(307, `${ovelaHome}/account`); };
