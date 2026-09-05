<script lang="ts">
  import StorageSpace from '$lib/components/shared-components/side-bar/StorageSpace.svelte';
  import RecentAlbums from '$lib/components/shared-components/side-bar/RecentAlbums.svelte';
  import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { Route } from '$lib/route';
  import { recentAlbumsDropdown } from '$lib/stores/preferences.store';
  import { NavbarGroup, NavbarItem } from '@immich/ui';
  import {
    mdiCogOutline,
    mdiAccount,
    mdiAccountMultiple,
    mdiAccountMultipleOutline,
    mdiAccountOutline,
    mdiArchiveArrowDown,
    mdiArchiveArrowDownOutline,
    mdiFolderOutline,
    mdiHeart,
    mdiHeartOutline,
    mdiImageAlbum,
    mdiImageMultiple,
    mdiImageMultipleOutline,
    mdiLink,
    mdiLock,
    mdiLockOutline,
    mdiMagnify,
    mdiMap,
    mdiMapOutline,
    mdiTagMultipleOutline,
    mdiToolbox,
    mdiToolboxOutline,
    mdiTrashCan,
    mdiTrashCanOutline,
    mdiUploadOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
</script>
<Sidebar ariaLabel={$t('primary')}>
  <NavbarItem title={$t('photos')} href={Route.photos()} icon={mdiImageMultipleOutline} activeIcon={mdiImageMultiple} />
  <NavbarItem
    title={$t('albums')}
    href={Route.albums()}
    icon={{ icon: mdiImageAlbum, flipped: true }}
    bind:expanded={$recentAlbumsDropdown}
  >
    {#snippet items()}
      <span in:fly={{ y: -20 }} class="hidden md:block">
        <RecentAlbums />
      </span>
    {/snippet}
  </NavbarItem>


  <NavbarItem title={$t('favorites')} href={Route.favorites()} icon={mdiHeartOutline} activeIcon={mdiHeart} />
  <NavbarItem title={$t('sharing')} href={Route.sharing()} icon={mdiAccountMultipleOutline} activeIcon={mdiAccountMultiple} />
  <div class="ovela-sidebar-spacer"></div>
  <NavbarItem title={$t('archive')} href={Route.archive()} icon={mdiArchiveArrowDownOutline} activeIcon={mdiArchiveArrowDown} />
  {#if featureFlagsManager.value.trash}<NavbarItem title={$t('trash')} href={Route.trash()} icon={mdiTrashCanOutline} activeIcon={mdiTrashCan} />{/if}
  <NavbarItem title="Settings" href="/preferences" icon={mdiCogOutline} />
  <details class="ovela-more-routes">
    <summary>More</summary>
    {#if authManager.user.isAdmin}<NavbarItem title="Photo administration" href={Route.systemSettings()} icon={mdiToolboxOutline} />{/if}
  {#if featureFlagsManager.value.search}
    <NavbarItem title={$t('explore')} href={Route.explore()} icon={mdiMagnify} />
  {/if}

  {#if featureFlagsManager.value.map}
    <NavbarItem title={$t('map')} href={Route.map()} icon={mdiMapOutline} activeIcon={mdiMap} />
  {/if}

  {#if authManager.preferences.people.enabled && authManager.preferences.people.sidebarWeb}
    <NavbarItem title={$t('people')} href={Route.people()} icon={mdiAccountOutline} activeIcon={mdiAccount} />
  {/if}

  {#if authManager.preferences.sharedLinks.enabled && authManager.preferences.sharedLinks.sidebarWeb}
    <NavbarItem title={$t('shared_links')} href={Route.sharedLinks()} icon={mdiLink} />
  {/if}

  {#if authManager.preferences.tags.enabled && authManager.preferences.tags.sidebarWeb}
    <NavbarItem title={$t('tags')} href={Route.tags()} icon={{ icon: mdiTagMultipleOutline, flipped: true }} />
  {/if}

  {#if authManager.preferences.recentlyAdded.sidebarWeb}
    <NavbarItem
      title={$t('recently_added')}
      href={Route.recentlyAdded()}
      icon={{ icon: mdiUploadOutline, flipped: true }}
    />
  {/if}

  {#if authManager.preferences.folders.enabled && authManager.preferences.folders.sidebarWeb}
    <NavbarItem title={$t('folders')} href={Route.folders()} icon={{ icon: mdiFolderOutline, flipped: true }} />
  {/if}

  <NavbarItem title={$t('utilities')} href={Route.utilities()} icon={mdiToolboxOutline} activeIcon={mdiToolbox} />

  <NavbarItem title={$t('locked_folder')} href={Route.locked()} icon={mdiLockOutline} activeIcon={mdiLock} />

  </details>
  <div class="ovela-sidebar-footer"><StorageSpace /><a href="/ovela-source.tgz" download>Immich · source code</a></div>
</Sidebar>
