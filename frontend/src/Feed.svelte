<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  
  import { token, alerts, archivedAlerts, groupedLiveFeed } from './store.js';
  import { getHostname, timeAgo } from './utils.js';

  export let showArchived = false;

  const dispatch = createEventDispatcher();
  const API_BASE = '/api';

  // Local auth fetch wrapper
  async function authFetch(url, options = {}) {
    options.headers = { ...options.headers, 'Authorization': `Bearer ${$token}` };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) { 
      $token = ''; 
      throw new Error("Unauthorized or Session Expired"); 
    }
    return res;
  }

  async function markAsRead(id) { 
    await authFetch(`${API_BASE}/alerts/${id}/read`, { method: 'PATCH' }); 
    // Update the store directly
    alerts.update(arr => arr.map(a => a.id === id ? { ...a, is_read: 1 } : a)); 
  }

  async function deleteAlert(id) { 
    await authFetch(`${API_BASE}/alerts/${id}`, { method: 'DELETE' }); 
    // Update the store directly
    alerts.update(arr => arr.filter(a => a.id !== id)); 
  }
</script>

<section class="feed-center">
  <div class="feed-header"><h2>{showArchived ? 'History' : 'Live Feed'}</h2></div>

  <div class="alerts-list">
    {#each (showArchived ? $archivedAlerts : $groupedLiveFeed) as alert (alert.id)}
      <div class="media-card interactive-card" animate:flip={{duration: 350, easing: cubicOut}} in:fly={{ y: 20, duration: 400 }} out:slide={{duration: 300}} on:click={() => dispatch('openAlert', alert)}>
        <div class="card-header">
          <div class="header-left">
            <img src="https://www.google.com/s2/favicons?domain={getHostname(alert.url)}&sz=32" alt="" class="site-favicon" />
            <a href={alert.url} target="_blank" class="badge link-badge" on:click|stopPropagation>{alert.name}</a>

            {#if alert.thread && alert.thread.length > 0}
              <span class="badge" style="background: rgba(0, 153, 255, 0.1); color: #0099ff; border-color: rgba(0, 153, 255, 0.3);">
                +{alert.thread.length} UPDATES
              </span>
            {/if}
          </div>
          <div class="header-right">
            <span class="timestamp">{timeAgo(alert.created_at)}</span>
            <button class="icon-btn delete-icon-btn" on:click|stopPropagation={() => deleteAlert(alert.id)} title="Dismiss">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>

        <div class="card-content clamped-view centered-content">
          <div class="html-wrapper">{@html alert.captured_html}</div>
          <div class="fade-overlay"></div>
        </div>

        <div class="card-footer">
          {#if !alert.is_read}
            <button class="ghost-btn seen-btn" on:click|stopPropagation={() => {
              markAsRead(alert.id);
              if(alert.thread) alert.thread.forEach(t => markAsRead(t.id));
            }}>
              {alert.thread && alert.thread.length > 0 ? 'MARK THREAD SEEN' : 'MARK AS SEEN'}
            </button>
          {:else}
            <div style="flex: 2;"></div>
          {/if}

          <button class="ghost-btn expand-btn" on:click|stopPropagation={() => dispatch('openAlert', alert)}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          </button>
        </div>
      </div>
    {/each}
  </div>

  {#if (showArchived ? $archivedAlerts : $groupedLiveFeed).length === 0}
    <div class="empty-state" in:fade>No new activity detected.</div>
  {/if}
</section>
