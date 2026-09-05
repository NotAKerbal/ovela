<script lang="ts" module>
  export const menuButtonId = 'top-menu-button';
</script>

<script lang="ts">
  import { page } from '$app/state';
  import { clickOutside } from '$lib/actions/click-outside';
  import SkipLink from '$lib/elements/SkipLink.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { Route } from '$lib/route';
  import { notificationManager } from '$lib/stores/notification-manager.svelte';
  import { Icon, IconButton } from '@immich/ui';
  import { mdiBellBadge, mdiMagnify, mdiTrayArrowUp } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import UserAvatar from '../UserAvatar.svelte';
  import SearchBar from '../search-bar/SearchBar.svelte';
  import { ovelaHome as home, ovelaProfile } from '$lib/managers/ovela-profile.svelte';
  import NotificationPanel from './NotificationPanel.svelte';

  type Props = { onUploadClick?: () => void; noBorder?: boolean };
  let { onUploadClick, noBorder = false }: Props = $props();
  let notificationsOpen = $state(false);
  const isPhotos = $derived(page.url.pathname.startsWith('/photos'));
  onMount(() => {
    notificationManager.refresh().catch(console.error);
    const refresh = () => { if (document.visibilityState === 'visible') void ovelaProfile.refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  });
</script>

<nav id="dashboard-navbar" class="ovela-navbar" class:ovela-photo-navbar={isPhotos} aria-label="Ovela">
  <SkipLink text={$t('skip_to_content')} />
  <div class="ovela-topbar" class:ovela-borderless={noBorder}>
    <a class="ovela-brand" href={home} aria-label="Ovela home">
      <span class="ovela-brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span>Ovela</span>
    </a>
    {#if featureFlagsManager.value.search}<div class="ovela-desktop-search"><SearchBar grayTheme={false} /></div>{/if}
    <div class="ovela-header-actions">
      {#if featureFlagsManager.value.search}
        <span class="ovela-mobile-search"><IconButton icon={mdiMagnify} href={Route.search()} aria-label={$t('go_to_search')} variant="ghost" color="secondary" /></span>
      {/if}
      {#if onUploadClick}
        <button class="ovela-upload" onclick={onUploadClick} aria-label={$t('upload')}><Icon icon={mdiTrayArrowUp} size="22" /><span>{$t('upload')}</span></button>
      {/if}
      <div class="ovela-notifications" use:clickOutside={{onOutclick: () => notificationsOpen = false, onEscape: () => notificationsOpen = false}}>
        {#if notificationManager.notifications.length > 0}
          <IconButton icon={mdiBellBadge} aria-label={$t('notifications')} variant="ghost" color="secondary" onclick={() => notificationsOpen = !notificationsOpen} />
        {/if}
        {#if notificationsOpen}<NotificationPanel />{/if}
      </div>
      <a class="ovela-account" aria-label={$t('account_settings')} href={`${home}/account`}>
        <span class="ovela-account-name">{(ovelaProfile.current?.name ?? authManager.user.name).split(' ')[0]}</span>
        <UserAvatar user={authManager.user} size="md" noTitle />
      </a>
    </div>
  </div>

</nav>
