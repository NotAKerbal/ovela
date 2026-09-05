<script lang="ts">
  import { page } from '$app/state';
  import { sidebarStore } from '$lib/stores/sidebar.svelte';
  import { Route } from '$lib/route';
  import { Icon } from '@immich/ui';
  import { mdiImageOutline, mdiImageAlbum, mdiAccountMultipleOutline, mdiDotsHorizontal } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { menuButtonId } from './NavigationBar.svelte';
  const items = $derived([
    {href: Route.photos(), label: $t('photos'), icon: mdiImageOutline},
    {href: Route.albums(), label: $t('albums'), icon: mdiImageAlbum},
    {href: Route.sharing(), label: $t('sharing'), icon: mdiAccountMultipleOutline},
  ]);
</script>

<nav class="ovela-mobile-nav" aria-label="Photo library">
  {#each items as item (item.href)}
    <a href={item.href} aria-current={!sidebarStore.isOpen && page.url.pathname.startsWith(item.href) ? 'page' : undefined} onclick={() => sidebarStore.reset()}><Icon icon={item.icon} size="24" /><span>{item.label}</span></a>
  {/each}
  <button id={menuButtonId} aria-label={$t('main_menu')} aria-current={!items.some(item => page.url.pathname.startsWith(item.href)) ? 'page' : undefined} aria-expanded={sidebarStore.isOpen} aria-controls="sidebar" onclick={() => sidebarStore.toggle()} onmousedown={(event) => { if (sidebarStore.isOpen) event.stopPropagation(); }}><Icon icon={mdiDotsHorizontal} size="26" /><span>More</span></button>
</nav>
