<script>
  import { onMount } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import piq_logo from './assets/piq-logo.png';

  const API_BASE = '/api';

  // Global UI State
  let token = localStorage.getItem('piq_token') || '';
  let theme = localStorage.getItem('piq_theme') || 'dark';
  let activePage = 'feed';

  // Auth State
  let authMode = 'login';
  let authUsername = '';
  let authPassword = '';
  let authError = '';

  let targetUrl = '';
  let proxyUrl = '';
  let siteName = '';
  let selectedSelector = '';

  let alerts = [];
  let sites = [];
  let isFullscreen = false;
  let showArchived = false;

  let isSyncing = false;
  let serverStatus = 'connected';

  // Unified Notification System
  let toast = { visible: false, message: '', type: 'success' };
  let toastTimeout;

  // Interactive State
  let activeModalAlert = null;
  let showPurgeConfirm = false;
  let inspectorActive = true;
  let iframeRef;

  $: activeAlerts = alerts.filter(a => !a.is_read);
  $: archivedAlerts = alerts.filter(a => a.is_read);

  $: latestAlertIds = (() => {
    const map = new Map();
    alerts.forEach(a => {
      if (!map.has(a.site_id) || new Date(a.created_at) > new Date(map.get(a.site_id).created_at)) {
        map.set(a.site_id, a);
      }
    });
    return new Set(Array.from(map.values()).map(a => a.id));
  })();

  $: {
    if (typeof window !== 'undefined') {
      localStorage.setItem('piq_theme', theme);
    }
  }

  function timeAgo(dateString) {
    const now = new Date();
    const past = new Date(dateString);

    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;

    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  }

  function showNotification(message, type = 'success', duration = 3000) {
    toast = { visible: true, message, type };
    clearTimeout(toastTimeout);
    if (duration > 0) {
      toastTimeout = setTimeout(() => toast.visible = false, duration);
    }
  }

  function handleNetworkChange(status) {
    serverStatus = status;
    if (status === 'offline') {
      showNotification('Connection lost. Working offline.', 'error', 0);
    } else {
      showNotification('Signal restored.', 'success');
      if (token) initFetch();
    }
  }

  async function authFetch(url, options = {}) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
      logout();
      throw new Error("Unauthorized");
    }
    return res;
  }

  async function handleAuth() {
    authError = '';
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      if (authMode === 'register') {
        authMode = 'login';
        showNotification('Identity secured. Please log in.', 'success');
      } else {
        token = data.token;
        localStorage.setItem('piq_token', token);
        authUsername = '';
        authPassword = '';
        initFetch();
      }
    } catch (err) {
      authError = err.message;
    }
  }

  function logout() {
    token = '';
    localStorage.removeItem('piq_token');
    sites = [];
    alerts = [];
    proxyUrl = '';
  }

  onMount(() => {
    if (token) initFetch();

    const pollInterval = setInterval(async () => {
      if (serverStatus === 'connected' && token) {
        await fetchAlerts(true);
      }
    }, 5000);

    window.addEventListener('offline', () => handleNetworkChange('offline'));
    window.addEventListener('online', () => handleNetworkChange('connected'));

    window.addEventListener('message', (event) => {
      if (event.data.type === 'SELECTOR_PICKED') {
        selectedSelector = event.data.selector;
        showNotification('Target element locked.', 'success');
      }
    });

    return () => clearInterval(pollInterval);
  });

  async function initFetch() {
    isSyncing = true;
    try {
      await Promise.all([fetchSites(), fetchAlerts()]);
    } catch(e) {
    } finally {
      isSyncing = false;
    }
  }

  async function fetchSites() {
    isSyncing = true;
    try {
      const res = await authFetch(`${API_BASE}/sites`);
      if (res.ok) sites = await res.json();
    } catch (e) {
      if(serverStatus !== 'offline') handleNetworkChange('offline');
    } finally {
      isSyncing = false;
    }
  }

  async function fetchAlerts(isBackground = false) {
    if (!isBackground) isSyncing = true;
    try {
      const res = await authFetch(`${API_BASE}/alerts`);
      if (res.ok) alerts = await res.json();
    } catch (e) {
      if(serverStatus !== 'offline') handleNetworkChange('offline');
    } finally {
      if (!isBackground) isSyncing = false;
    }
  }

  function loadProxy() {
    if (!targetUrl) return;
    proxyUrl = `${API_BASE}/proxy?url=${encodeURIComponent(targetUrl)}&token=${token}`;
    selectedSelector = '';
    inspectorActive = true;
  }

  function toggleInspector() {
    inspectorActive = !inspectorActive;
    if (iframeRef && iframeRef.contentWindow) {
      iframeRef.contentWindow.postMessage({ type: 'TOGGLE_INSPECTOR', active: inspectorActive }, '*');
    }
  }

  function pickAgain() {
    selectedSelector = '';
    inspectorActive = true;
    if (iframeRef && iframeRef.contentWindow) {
      iframeRef.contentWindow.postMessage({ type: 'TOGGLE_INSPECTOR', active: inspectorActive }, '*');
    }
  }

  async function saveTarget() {
    if (!siteName || !targetUrl || !selectedSelector) return;
    isSyncing = true;
    const res = await authFetch(`${API_BASE}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: siteName, url: targetUrl, css_selector: selectedSelector })
    });
    if (res.ok) {
      siteName = ''; selectedSelector = ''; proxyUrl = ''; fetchSites();
      showNotification('Node added to the engine.', 'success');
    }
  }

  async function deleteTarget(id) {
    await authFetch(`${API_BASE}/sites/${id}`, { method: 'DELETE' });
    fetchSites();
    fetchAlerts();
  }

  async function toggleFreeze(id, currentState) {
    await authFetch(`${API_BASE}/sites/${id}/freeze`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_frozen: !currentState })
    });
    fetchSites();
  }

  async function markAsRead(id) {
    await authFetch(`${API_BASE}/alerts/${id}/read`, { method: 'PATCH' });
    alerts = alerts.map(a => a.id === id ? { ...a, is_read: 1 } : a);
    if(activeModalAlert && activeModalAlert.id === id) activeModalAlert.is_read = 1;
  }

  async function deleteAlert(id) {
    await authFetch(`${API_BASE}/alerts/${id}`, { method: 'DELETE' });
    alerts = alerts.filter(a => a.id !== id);
    if(activeModalAlert && activeModalAlert.id === id) activeModalAlert = null;
  }

  async function clearAlerts() {
    await authFetch(`${API_BASE}/alerts`, { method: 'DELETE' });
    fetchAlerts();
    showPurgeConfirm = false;
    showNotification('Canvas cleared.', 'success');
  }
</script>

<div class="app-wrapper {theme}">

  {#if toast.visible}
    <div class="toast {toast.type}" in:fly={{y: 50, duration: 300, easing: cubicOut}} out:fade>
      {#if toast.type === 'error'}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C3.56 8.54 2 10.53 2 13h2c0-2.21 1.46-4.08 3.53-4.75l2.05 2.05C8.22 10.59 9 11.2 9 12h2c0-1.1-.9-2-2-2l2.06-2.06L12 8.89l1.11 1.11 5.62 5.62 1.41-1.41L4.41 3.86 3 5.27z"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      {/if}
      {toast.message}
    </div>
  {/if}

  {#if !token}
    <div class="auth-container">
      <div class="auth-card" in:fade>
        <img src={piq_logo} alt="piq" class="auth-logo" />
        <h2 style="text-align: center; margin-bottom: 2rem;">{authMode === 'login' ? 'SECURE LOGIN' : 'INITIALIZE NODE'}</h2>

        {#if authError}
          <div class="auth-error" in:slide>{authError}</div>
        {/if}

        <input type="text" bind:value={authUsername} placeholder="Username" />
        <input type="password" bind:value={authPassword} placeholder="Encryption Key (Password)" on:keydown={e => e.key === 'Enter' && handleAuth()} />

        <button class="action-btn" on:click={handleAuth} style="margin-top: 1.5rem;">
          {authMode === 'login' ? 'ENTER PLATFORM' : 'REGISTER'}
        </button>

        <button class="ghost-btn" on:click={() => { authMode = authMode === 'login' ? 'register' : 'login'; authError = ''; }} style="width: 100%; border: none; margin-top: 0.5rem;">
          {authMode === 'login' ? 'Need access? Register here' : 'Already have access? Log in'}
        </button>
      </div>
    </div>
  {:else}

    <div class="layout">

      <aside class="side-nav">
        <div class="nav-brand">
          <img src={piq_logo} alt="piq" />
        </div>

        <nav class="nav-links">
          <button class="nav-btn {activePage === 'feed' && !showArchived ? 'active' : ''}" on:click={() => { activePage = 'feed'; showArchived = false; }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
            LIVE FEED
          </button>

          <button class="nav-btn {activePage === 'feed' && showArchived ? 'active' : ''}" on:click={() => { activePage = 'feed'; showArchived = true; }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
            ARCHIVE
          </button>

          <button class="nav-btn {activePage === 'settings' ? 'active' : ''}" on:click={() => activePage = 'settings'} style="margin-top: 1rem;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
            SETTINGS
          </button>
        </nav>
      </aside>

      <div class="main-area">

        <header class="top-nav">
          <div class="header-with-spinner">
            {#if isSyncing}<div class="spinner" in:fade out:fade></div>{/if}
          </div>
          <div class="top-nav-actions">
            {#if activePage === 'feed'}
              <button class="icon-btn delete-icon-btn" style="color: #ff4444;" on:click={() => showPurgeConfirm = true} title="Clear Canvas">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/></svg>
              </button>
            {/if}
            <button class="ghost-btn" on:click={logout} style="margin: 0; padding: 4px 12px;">DISCONNECT</button>
          </div>
        </header>

        {#if activePage === 'feed'}
          <main class="dashboard-grid">

            <section class="feed-center">
              <div class="feed-header">
                <h2>{showArchived ? 'ARCHIVE' : 'LIVE FEED'}</h2>
              </div>

              <div class="alerts-list">
                {#each (showArchived ? archivedAlerts : activeAlerts) as alert (alert.id)}
                  <div class="media-card" animate:flip={{duration: 350, easing: cubicOut}} in:fly={{ y: 20, duration: 400, easing: cubicOut }} out:slide={{duration: 300, easing: cubicOut}}>
                    <div class="card-header">
                      <div class="header-left">
                        <a href={alert.url} target="_blank" class="badge link-badge">{alert.name}</a>
                        {#if !latestAlertIds.has(alert.id)}
                          <span class="badge outdated-badge">OUTDATED</span>
                        {/if}
                      </div>
                      <div class="header-right">
                        <span class="timestamp">{timeAgo(alert.created_at)}</span>
                        <button class="icon-btn delete-icon-btn" on:click={() => deleteAlert(alert.id)} title="Remove">
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                      </div>
                    </div>

                    <div class="card-content clamped-view">
                      <div class="html-wrapper">
                        {@html alert.captured_html}
                      </div>
                      <div class="fade-overlay"></div>
                    </div>

                    <div class="card-footer">
                      <button class="ghost-btn expand-btn" on:click={() => activeModalAlert = alert} title="Expand View">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                      </button>

                      {#if !alert.is_read}
                        <button class="action-btn" on:click={() => markAsRead(alert.id)}>
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                          MARK AS SEEN
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}

              </div>
              {#if (showArchived ? archivedAlerts : activeAlerts).length === 0}
                <div class="empty-state" in:fade>The web is quiet right now.<br>Add a target to awaken the engine.</div>
              {/if}
            </section>

            <aside class="right-panel">

              <div class="inspector-section" in:fade={{duration: 400}}>
                <h2>01. SELECT TARGET</h2>
                <div class="controls">
                  <input type="text" bind:value={targetUrl} placeholder="https://..." on:keydown={e => e.key === 'Enter' && loadProxy()} />
                  <button on:click={loadProxy}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                  </button>
                </div>

                <div class="iframe-container {isFullscreen ? 'fullscreen' : ''}">
                  <div class="iframe-controls">
                    {#if proxyUrl}
                      <button class="overlay-btn text-overlay-btn" on:click={toggleInspector} class:active-state={inspectorActive}>
                        {inspectorActive ? 'INSPECT' : 'INTERACT'}
                      </button>
                    {/if}
                    <button class="icon-btn overlay-btn" on:click={() => isFullscreen = !isFullscreen} title={isFullscreen ? "Minimize" : "Expand"}>
                      {#if isFullscreen}
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
                      {:else}
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                      {/if}
                    </button>
                  </div>
                  {#if proxyUrl}
                    <iframe bind:this={iframeRef} class="proxy-iframe" src={proxyUrl} title="Proxy" in:fade></iframe>
                  {:else}
                    <div class="placeholder">AWAITING TARGET</div>
                  {/if}
                </div>

                <div class="commit-header">
                  <p>Node: <strong>{selectedSelector || 'NULL'}</strong></p>
                  {#if selectedSelector}
                    <button class="ghost-btn warning-btn" on:click={pickAgain} in:fade>RE-PICK</button>
                  {/if}
                </div>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                  <input type="text" bind:value={siteName} placeholder="Reference Name" on:keydown={e => e.key === 'Enter' && selectedSelector && saveTarget()} style="margin: 0;"/>
                  <button on:click={saveTarget} disabled={!selectedSelector} style="margin: 0;">ADD</button>
                </div>
              </div>

              <div class="nodes-section">
                <div class="header-with-spinner" style="margin-bottom: 1rem;">
                  <h2>ACTIVE NODES</h2>
                </div>

                <ul class="node-list">
                  {#each sites as site (site.id)}
                    <li class={site.is_frozen ? 'frozen-node' : ''} animate:flip={{duration: 300, easing: cubicOut}} in:fly={{x: 20, duration: 300}} out:slide={{duration: 300}}>
                      <div class="node-info">
                        <span class="status-pulse {site.is_frozen ? 'frozen' : 'active'}"></span>
                        <strong>{site.name}</strong>
                        {#if site.is_frozen}<span class="badge frozen-badge">FROZEN</span>{/if}
                        <br><small>{site.url}</small>
                      </div>
                      <div class="node-actions">
                        <button class="ghost-btn" on:click={() => toggleFreeze(site.id, site.is_frozen)}>
                          {site.is_frozen ? 'UNFREEZE' : 'FREEZE'}
                        </button>
                        <button class="icon-btn delete-icon-btn" on:click={() => deleteTarget(site.id)}>
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                      </div>
                    </li>
                  {/each}
                  {#if sites.length === 0}
                    <div class="empty-state mini-empty" in:fade>Awaiting instructions.<br>Add a node to begin.</div>
                  {/if}
                </ul>
              </div>

            </aside>
          </main>

        {:else if activePage === 'settings'}
          <main class="settings-page" in:fade={{duration: 200}}>
            <div class="settings-container">
              <h2>SETTINGS</h2>

              <div class="setting-card">
                <div class="setting-info">
                  <h3>Appearance</h3>
                  <p>Select your preferred UI theme.</p>
                </div>
                <div class="setting-control">
                  <select bind:value={theme}>
                    <option value="dark">Dark Theme</option>
                    <option value="light">Light Theme</option>
                  </select>
                </div>
              </div>

            </div>
          </main>
        {/if}
      </div>
    </div>

    {#if activeModalAlert}
      <div class="modal-backdrop" in:fade={{duration: 200}} out:fade={{duration: 200}} on:click={() => activeModalAlert = null}>
        <div class="modal-card" on:click|stopPropagation>
          <div class="modal-header">
            <h3>{activeModalAlert.name}</h3>
            <button class="icon-btn close-btn" on:click={() => activeModalAlert = null}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
          <div class="modal-content">
            {@html activeModalAlert.captured_html}
          </div>
          {#if !activeModalAlert.is_read}
            <div class="modal-footer">
              <button class="action-btn" on:click={() => markAsRead(activeModalAlert.id)}>MARK AS SEEN</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if showPurgeConfirm}
      <div class="modal-backdrop" in:fade={{duration: 200}} out:fade={{duration: 200}} on:click={() => showPurgeConfirm = false}>
        <div class="modal-card mini-modal" on:click|stopPropagation>
          <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0;">
            <h3 style="color: #ff4444;">Clear Canvas</h3>
          </div>
          <div class="modal-content mini-content">
            <p>Delete all signals? Your attention will be yours again.</p>
          </div>
          <div class="modal-footer mini-footer">
            <button class="ghost-btn" on:click={() => showPurgeConfirm = false}>CANCEL</button>
            <button class="action-btn danger-bg" on:click={clearAlerts}>CLEAR ALL</button>
          </div>
        </div>
      </div>
    {/if}

  {/if}
</div>

<style>
  :global(#app) {
    max-width: none !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100vw !important;
  }

  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; padding: 0; background: #0a0a0a; overflow: hidden; }

  .app-wrapper {
    /* default dark theme */
    --bg-main: #0a0a0a;
    --bg-panel: #111111;
    --bg-card: #1a1a1a;
    --border-color: #222222;
    --text-main: #ffffff;
    --text-muted: #888888;
    --accent: #ffffff;

    height: 100vh;
    width: 100%;
    display: flex;
    background: var(--bg-main);
    color: var(--text-main);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  /* light theme overrides */
  .app-wrapper.light {
    --bg-main: #f0f2f5;
    --bg-panel: #ffffff;
    --bg-card: #ffffff;
    --border-color: #d1d5db;
    --text-main: #111827;
    --text-muted: #6b7280;
    --accent: #111827;
  }

  .app-wrapper.light .auth-logo,
  .app-wrapper.light .nav-brand img { filter: invert(1); }

  h1, h2, h3 { font-weight: 700; margin-top: 0; letter-spacing: -0.5px; }
  h1 { margin: 0; }
  h2 { font-size: 1.1rem; color: var(--text-muted); }

  input, button, select { padding: 0.6rem 1rem; font-family: inherit; font-size: 0.85rem; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 6px; min-height: 36px; transition: all 0.2s; outline: none; }
  input, select { width: 100%; }

  button { background: var(--accent); color: var(--bg-main); font-weight: 700; cursor: pointer; border: none; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.danger-bg { background: #ff4444; color: white; border: none; }
  button.danger-bg:hover { background: #d32f2f; }

  .ghost-btn { background: transparent; color: var(--text-muted); border: 1px solid var(--border-color); width: auto; display: inline-flex; align-items: center; justify-content: center; }
  .ghost-btn:hover { background: var(--bg-card); color: var(--text-main); }
  .ghost-btn.warning-btn { color: #ffaa00; border-color: rgba(255,170,0,0.3); margin: 0; padding: 4px 8px; font-size: 0.75rem; }

  .icon-btn { background: transparent; border: none; padding: 4px; min-height: auto; width: auto; color: var(--text-muted); margin: 0; display: flex; align-items: center; justify-content: center; }
  .icon-btn:hover { color: var(--text-main); }
  .delete-icon-btn:hover { color: #ff4444; }

  .auth-container { width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
  .auth-card { background: var(--bg-panel); padding: 3rem; border-radius: 12px; border: 1px solid var(--border-color); width: 100%; max-width: 400px; display: flex; flex-direction: column; }
  .auth-logo { width: 40%; margin: 0 auto 2rem auto; display: block; }
  .auth-error { background: rgba(255, 68, 68, 0.1); color: #ff4444; padding: 1rem; border: 1px solid rgba(255, 68, 68, 0.3); border-radius: 6px; margin-bottom: 1rem; font-size: 0.85rem; text-align: center; }

  .layout {
    display: flex;
    width: 100%;
    height: 100vh;
  }

  .side-nav {
    width: 240px;
    background: var(--bg-panel);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
  }
  .nav-brand {
    height: 64px;
    display: flex;
    align-items: center;
    padding: 0 1.5rem;
    border-bottom: 1px solid var(--border-color);
  }
  .nav-brand img { height: 28px; width: auto; }

  .nav-links { padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .nav-btn { background: transparent; color: var(--text-muted); border: none; justify-content: flex-start; padding: 0.8rem 1rem; font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; border-radius: 8px;}
  .nav-btn:hover { background: rgba(0,0,0,0.05); color: var(--text-main); }
  .app-wrapper:not(.light) .nav-btn:hover { background: rgba(255,255,255,0.05); }
  .nav-btn.active { background: var(--bg-card); color: var(--accent); border: 1px solid var(--border-color); }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .top-nav {
    height: 64px;
    padding: 0 2rem;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-main);
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 10;
  }
  .top-nav-actions { display: flex; gap: 1rem; align-items: center; }

  .settings-page { flex: 1; padding: 3rem 2rem; background: var(--bg-main); overflow-y: auto; }
  .settings-container { max-width: 800px; margin: 0 auto; }
  .settings-container h2 { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); }
  .setting-card { display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); }
  .setting-info h3 { margin: 0 0 0.5rem 0; font-weight: 600; font-size: 1rem; }
  .setting-info p { margin: 0; color: var(--text-muted); font-size: 0.85rem; }
  .setting-control { min-width: 200px; }

  .dashboard-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 450px;
    overflow: hidden;
  }

  .feed-center {
    padding: 2rem;
    overflow-y: auto;
    background: var(--bg-main);
  }
  .feed-header { margin-bottom: 2rem; text-align: center; }

  .alerts-list {
    column-count: 1;
    column-gap: 1.5rem;
    width: 100%;
    margin: 0 auto;
  }

  @media (min-width: 1100px) {
    .alerts-list { column-count: 2; max-width: 1200px; }
  }
  @media (min-width: 1600px) {
    .alerts-list { column-count: 3; max-width: 1600px; }
  }

  .media-card {
    background: var(--bg-card);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border-color);
    /* Critical for CSS Columns to not split cards across rows */
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 1.5rem;
    display: inline-block;
    width: 100%;
  }

  .right-panel {
    border-left: 1px solid var(--border-color);
    background: var(--bg-panel);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .inspector-section {
    padding: 1.5rem;
    flex: 0 0 auto;
  }
  .nodes-section {
    flex: 1;
    border-top: 1px solid var(--border-color);
    padding: 1.5rem;
    overflow-y: auto;
  }

  .status-pulse {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
  }
  .status-pulse.active {
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
    animation: pulse-glow 2s infinite ease-in-out;
  }
  .status-pulse.frozen {
    background: var(--text-muted);
  }

  @keyframes pulse-glow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .toast { position: fixed; bottom: 20px; left: 20px; z-index: 10000; display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 0.9rem; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
  .toast.error { background: #d32f2f; }
  .toast.success { background: #388e3c; }

  .header-with-spinner { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .spinner { width: 16px; height: 16px; border: 2px solid var(--border-color); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .controls { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .controls input { margin: 0; flex: 1; }
  .controls button { margin: 0; width: auto; padding: 0.6rem; }

  .iframe-container { height: 280px; border: 1px dashed var(--border-color); border-radius: 8px; position: relative; margin: 1rem 0; background: #000; transition: all 0.3s ease; }
  iframe { width: 100%; height: 100%; border: none; border-radius: 8px; background: #fff;}
  .placeholder { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-muted); font-family: monospace; font-size: 0.85rem; }

  .iframe-container.fullscreen { position: fixed; top: 3vh; left: 3vw; width: 94vw; height: 94vh; z-index: 9999; margin: 0; border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 0 0 100vmax rgba(0,0,0,0.85), 0 20px 50px rgba(0,0,0,0.5); }

  .iframe-controls { position: absolute; top: 10px; right: 10px; z-index: 10000; display: flex; gap: 8px; }
  .overlay-btn { background: rgba(0,0,0,0.7); color: white; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; backdrop-filter: blur(4px); }
  .text-overlay-btn { padding: 4px 12px; font-weight: bold; font-size: 0.7rem; letter-spacing: 0.5px; }
  .text-overlay-btn.active-state { color: #ffaa00; border-color: #ffaa00; box-shadow: 0 0 8px rgba(255, 170, 0, 0.2); }

  .commit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; gap: 1rem; }
  .commit-header p { margin: 0; font-size: 0.85rem; overflow-wrap: anywhere; }

  .node-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .node-list li { display: flex; flex-direction: column; padding: 1rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); transition: opacity 0.3s ease; }
  .node-list li.frozen-node { opacity: 0.5; border-style: dashed; }
  .node-info { margin-bottom: 0.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .node-actions { display: flex; gap: 0.5rem; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 0.5rem; }

  .card-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); }
  .header-left, .header-right { display: flex; align-items: center; gap: 10px; }

  .badge { font-family: monospace; background: #2a2a2a; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; }
  .link-badge { text-decoration: none; color: var(--accent); transition: background 0.2s; }
  .link-badge:hover { background: #3a3a3a; }
  .frozen-badge { background: rgba(0, 102, 255, 0.2); color: #0066ff; margin-left: 0.5rem; }
  .outdated-badge { background: rgba(255, 170, 0, 0.15); color: #ffaa00; font-size: 0.65rem; border: 1px solid rgba(255, 170, 0, 0.3); }

  .timestamp { color: var(--text-muted); font-size: 0.85rem; font-weight: 600; }

  /* Modals */
  .modal-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 2rem; backdrop-filter: blur(4px); }
  .modal-card { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); width: 100%; max-width: 900px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.7); }
  .modal-card.mini-modal { max-width: 400px; }
  .modal-header { padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
  .modal-header h3 { margin: 0; font-family: monospace; }
  .modal-content { padding: 0; background: #000; overflow-y: auto; display: flex; justify-content: center; align-items: center; min-height: 200px; flex-direction: column; }
  .modal-content.mini-content { background: var(--bg-card); min-height: auto; padding: 1rem 2rem 2rem 2rem; text-align: center; color: var(--text-muted); }
  .modal-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--border-color); }
  .modal-footer.mini-footer { display: flex; gap: 1rem; border-top: none; padding-top: 0; }

  .card-content { background: #000; position: relative; }
  .card-content.clamped-view { height: 180px; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start; }

  .html-wrapper { width: 100%; padding: 1rem; }
  .fade-overlay { position: absolute; bottom: 0; left: 0; right: 0; height: 60px; background: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%); pointer-events: none; }

  .card-content :global(img), .card-content :global(video),
  .modal-content :global(img), .modal-content :global(video) { width: 100%; height: auto; max-height: 600px; object-fit: contain; display: block; margin: 0 auto; }
  .card-content :global(nav), .card-content :global(footer), .card-content :global(script),
  .modal-content :global(nav), .modal-content :global(footer), .modal-content :global(script) { display: none !important; }
  .card-content :global(a), .modal-content :global(a) { color: var(--accent); padding: 1rem; display: block; word-break: break-all; text-align: center;}
  .card-content :global(svg), .modal-content :global(svg) { max-width: 100%; height: auto; }

  .card-footer { padding: 1rem 1.5rem; background: var(--bg-card); border-top: 1px solid var(--border-color); display: flex; gap: 1rem; align-items: center; }
  .expand-btn { margin: 0; max-width: 50px; }
  .action-btn { margin: 0; flex: 2; display: flex; justify-content: center; align-items: center; }

  .empty-state { text-align: center; padding: 4rem 2rem; color: var(--text-muted); font-family: monospace; border: 1px dashed var(--border-color); border-radius: 12px; line-height: 1.5; }
  .empty-state.mini-empty { padding: 2rem 1rem; font-size: 0.85rem; }

  @media (max-width: 1024px) {
    :global(body) { overflow-y: auto; }
    .layout { flex-direction: column; height: auto; }
    .side-nav { width: 100%; border-right: none; border-bottom: 1px solid var(--border-color); flex-direction: row; align-items: center; justify-content: space-between; }
    .nav-brand { border-bottom: none; }
    .nav-links { flex-direction: row; padding: 0 1rem; }
    .dashboard-grid { display: flex; flex-direction: column; }
    .right-panel { border-left: none; border-top: 1px solid var(--border-color); }
    .alerts-list { column-count: 1; }
  }
</style>