<script>
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  
  import { token, theme, toast, serverStatus, isSyncing, sites, alerts } from './store.js';
  import Auth from './Auth.svelte';
  import Feed from './Feed.svelte';
  import Inspector from './Inspector.svelte';
  import Settings from './Settings.svelte';
  import GlobalModals from './GlobalModals.svelte';
  import piq_logo from './assets/piq-logo.png';

  const API_BASE = '/api';

  let activePage = 'feed';
  let showArchived = false;
  let showUserMenu = false;

  let editingNode = null;
  let activeModalAlert = null;
  let confirmDialog = { visible: false, title: '', message: '', actionText: '', onConfirm: null };

  function switchTab(page, archived = false) {
    activePage = page;
    showArchived = archived;
    if (typeof window !== 'undefined') {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    }
  }

  function requestConfirm(title, message, actionText, callback) {
    confirmDialog = { visible: true, title, message, actionText, onConfirm: callback };
    showUserMenu = false;
  }

  function handleWindowClick(e) { 
    if (showUserMenu && !e.target.closest('.user-menu-container')) showUserMenu = false; 
  }

  let toastTimeout;
  function showNotification(message, type = 'success', duration = 3000) {
    toast.set({ visible: true, message, type });
    clearTimeout(toastTimeout);
    if (duration > 0) toastTimeout = setTimeout(() => toast.set({ visible: false, message: '', type: 'success' }), duration);
  }

  function handleNetworkChange(status) {
    $serverStatus = status;
    if (status === 'offline') showNotification('Connection lost.', 'error', 0);
    else { showNotification('Signal restored.', 'success'); if ($token) initFetch(); }
  }

  async function authFetch(url, options = {}) {
    options.headers = { ...options.headers, 'Authorization': `Bearer ${$token}` };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) { logout(); throw new Error("Unauthorized or Session Expired"); }
    return res;
  }

  function logout() { 
    $token = ''; 
    $sites = []; 
    $alerts = []; 
  }

  onMount(() => {
    if ($token) initFetch();
    // жива връзка
    const pollInterval = setInterval(async () => { if ($serverStatus === 'connected' && $token) await fetchAlerts(true); }, 5000);
    window.addEventListener('offline', () => handleNetworkChange('offline'));
    window.addEventListener('online', () => handleNetworkChange('connected'));
    return () => clearInterval(pollInterval);
  });

  async function initFetch() { 
    $isSyncing = true; 
    try { await Promise.all([fetchSites(), fetchAlerts()]); } finally { $isSyncing = false; } 
  }

  async function fetchSites() {
    try { const res = await authFetch(`${API_BASE}/sites`); if (res.ok) $sites = await res.json(); }
    catch (e) { if($serverStatus !== 'offline') handleNetworkChange('offline'); }
  }

  async function fetchAlerts(isBackground = false) {
    if (!isBackground) $isSyncing = true; else $isSyncing = true;
    try { const res = await authFetch(`${API_BASE}/alerts`); if (res.ok) $alerts = await res.json(); }
    catch (e) { if($serverStatus !== 'offline') handleNetworkChange('offline'); }
    finally { setTimeout(() => $isSyncing = false, 800); }
  }

  async function clearAlerts() {
    if(showArchived) {
      await authFetch(`${API_BASE}/alerts/archive`, { method: 'DELETE' });
      fetchAlerts(); showNotification('Archive cleared.', 'success');
    } else {
      await authFetch(`${API_BASE}/alerts`, { method: 'DELETE' });
      fetchAlerts(); showNotification('All updates cleared.', 'success');
    }
  }
</script>

<svelte:window on:click={handleWindowClick} />

<div class="app-wrapper {$theme}">
  {#if $toast.visible}
    <div class="toast {$toast.type}" in:fly={{y: 50, duration: 300, easing: cubicOut}} out:fade>
      {#if $toast.type === 'error'}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C3.56 8.54 2 10.53 2 13h2c0-2.21 1.46-4.08 3.53-4.75l2.05 2.05C8.22 10.59 9 11.2 9 12h2c0-1.1-.9-2-2-2l2.06-2.06L12 8.89l1.11 1.11 5.62 5.62 1.41-1.41L4.41 3.86 3 5.27z"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      {/if}
      {$toast.message}
    </div>
  {/if}

  {#if !$token}
    <Auth />
  {:else}
    <div class="layout">
      <aside class="side-nav desktop-only">
        <div class="nav-brand"><img src={piq_logo} alt="piq" /></div>
        <nav class="nav-links" style="flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <button class="nav-btn {activePage === 'feed' && !showArchived ? 'active' : ''}" on:click={() => switchTab('feed', false)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg> Live Updates
            </button>
            <button class="nav-btn {activePage === 'feed' && showArchived ? 'active' : ''}" on:click={() => switchTab('feed', true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg> History
            </button>
          </div>
          <div>
            <button class="nav-btn {activePage === 'settings' ? 'active' : ''}" on:click={() => switchTab('settings', false)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg> Settings
            </button>
          </div>
        </nav>
      </aside>

      <div class="main-area">
        <header class="top-nav">
          <div class="header-with-spinner">
            <div class="mobile-only nav-brand" style="border:none; padding: 0;"><img src={piq_logo} alt="piq" /></div>
          </div>
          <div class="top-nav-actions">
            {#if activePage === 'feed'}
              {#if $isSyncing}
                <div style="display:flex; align-items:center; gap:8px; color: var(--text-muted); font-size: 0.8rem; font-weight: 600;" in:fade out:fade>
                  <span class="status-pulse active" style="margin:0;"></span> SYNCING
                </div>
              {/if}
              <button class="icon-btn delete-icon-btn" on:click={() => requestConfirm(showArchived ? "Clear Archive" : "Clear All Updates", showArchived ? "Permanently delete your history?" : "Dismiss all visible alerts?", "CLEAR", clearAlerts)}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/></svg>
              </button>
            {/if}
            <div class="user-menu-container desktop-only">
              <button class="icon-btn profile-btn" on:click|stopPropagation={() => showUserMenu = !showUserMenu}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
              </button>
              {#if showUserMenu}
                <div class="dropdown-menu" in:fly={{y: -10, duration: 150}}>
                  <button on:click={() => { switchTab('settings', false); showUserMenu = false; }}>Settings</button>
                  <div class="dropdown-divider"></div>
                  <button style="color: #ff4444;" on:click={() => requestConfirm("Sign Out", "End the current session?", "SIGN OUT", logout)}>Sign Out</button>
                </div>
              {/if}
            </div>
          </div>
        </header>

        {#if activePage === 'feed'}
          <main class="dashboard-grid">
            <Feed {showArchived} on:openAlert={(e) => activeModalAlert = e.detail} />
            <Inspector on:editNode={(e) => editingNode = e.detail} on:requestConfirm={(e) => requestConfirm(e.detail.title, e.detail.message, e.detail.actionText, e.detail.onConfirm)} />
          </main>
        {:else if activePage === 'settings'}
          <Settings on:requestConfirm={(e) => requestConfirm(e.detail.title, e.detail.message, e.detail.actionText, e.detail.onConfirm)} />
        {/if}
      </div>

      <nav class="mobile-bottom-nav mobile-only">
        <button class="nav-btn {activePage === 'feed' && !showArchived ? 'active' : ''}" on:click={() => switchTab('feed', false)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg><span>Live</span>
        </button>
        <button class="nav-btn {activePage === 'feed' && showArchived ? 'active' : ''}" on:click={() => switchTab('feed', true)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg><span>Archive</span>
        </button>
        <button class="nav-btn {activePage === 'settings' ? 'active' : ''}" on:click={() => switchTab('settings', false)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg><span>Account</span>
        </button>
      </nav>
    </div>

    <GlobalModals bind:editingNode bind:activeModalAlert bind:confirmDialog />
  {/if}
</div>
