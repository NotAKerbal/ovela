<script lang="ts">
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import UserSettingsList from '../user-settings/UserSettingsList.svelte';
  import { getKeyboardActions } from '$lib/services/keyboard.service';
  import { Container } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  const { KeyboardShortcuts } = $derived(getKeyboardActions($t));
</script>

<UserPageLayout title={data.meta.title} actions={[KeyboardShortcuts]}>
  <Container size="medium" center>
    {#if authManager.user.isAdmin}<p class="ovela-settings-admin"><a href={Route.systemSettings()}>Administration →</a></p>{/if}
    <UserSettingsList keys={data.keys} sessions={data.sessions} />
  </Container>
</UserPageLayout>
