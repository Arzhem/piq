<script>
  import { onMount } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import piq_logo from './assets/piq-logo.png';

  const API_BASE = '/api';

  let targetUrl = '';
  let proxyUrl = '';
  let siteName = '';
  let selectedSelector = '';

  let alerts = [];
  let sites = [];
  let isFullscreen = false;
  let showArchived = false;

  // UI State
  let isSyncing = false;
  let serverStatus = 'connected';

  // Unified Notification System
  let toast = { visible: false, message: '', type: 'success' };
  let toastTimeout;

  // Interactive State
  let activeModalAlert = null;
  let showPurgeConfirm = false;
  let inspectorActive = true;
  let iframeRef; // Fixes the IDE contentWindow error

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
      showNotification('No internet connection', 'error', 0);
    } else {
      showNotification('Connection restored', 'success');
      initFetch();
    }
  }

  onMount(() => {
    initFetch();

    const pollInterval = setInterval(async () => {
      if (serverStatus === 'connected') {
        await fetchAlerts(true);
      }
    }, 5000);

    window.addEventListener('offline', () => handleNetworkChange('offline'));
    window.addEventListener('online', () => handleNetworkChange('connected'));

    window.addEventListener('message', (event) => {
      if (event.data.type === 'SELECTOR_PICKED') {
        selectedSelector = event.data.selector;
        showNotification('Target element locked successfully!', 'success');
      }
    });

    return () => clearInterval(pollInterval);
  });

  async function initFetch() {
    isSyncing = true;
    try {
      await Promise.all([fetchSites(), fetchAlerts()]);
    } finally {
      isSyncing = false;
    }
  }

  async function fetchSites() {
    isSyncing = true;
    try {
      const res = await fetch(`${API_BASE}/sites`);
      if (res.ok) sites = await res.json();
    } catch (e) {
      handleNetworkChange('offline');
    } finally {
      isSyncing = false;
    }
  }

  async function fetchAlerts(isBackground = false) {
    if (!isBackground) isSyncing = true;
    try {
      const res = await fetch(`${API_BASE}/alerts`);
      if (res.ok) alerts = await res.json();
    } catch (e) {
      handleNetworkChange('offline');
    } finally {
      isSyncing = false;
    }
  }

  function loadProxy() {
    if (!targetUrl) return;
    proxyUrl = `${API_BASE}/proxy?url=${encodeURIComponent(targetUrl)}`;
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
    const res = await fetch(`${API_BASE}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: siteName, url: targetUrl, css_selector: selectedSelector })
    });
    if (res.ok) {
      siteName = ''; selectedSelector = ''; proxyUrl = ''; fetchSites();
    }
  }

  async function deleteTarget(id) {
    await fetch(`${API_BASE}/sites/${id}`, { method: 'DELETE' });
    fetchSites();
    fetchAlerts();
  }

  async function toggleFreeze(id, currentState) {
    await fetch(`${API_BASE}/sites/${id}/freeze`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_frozen: !currentState })
    });
    fetchSites();
  }

  async function markAsRead(id) {
    await fetch(`${API_BASE}/alerts/${id}/read`, { method: 'PATCH' });
    alerts = alerts.map(a => a.id === id ? { ...a, is_read: 1 } : a);
    if(activeModalAlert && activeModalAlert.id === id) activeModalAlert.is_read = 1;
  }

  async function deleteAlert(id) {
    await fetch(`${API_BASE}/alerts/${id}`, { method: 'DELETE' });
    alerts = alerts.filter(a => a.id !== id);
    if(activeModalAlert && activeModalAlert.id === id) activeModalAlert = null;
  }

  async function clearAlerts() {
    await fetch(`${API_BASE}/alerts`, { method: 'DELETE' });
    fetchAlerts();
    showPurgeConfirm = false;
  }
</script>

<div class="app-wrapper">

  <header class="top-nav">
    <div class="brand">
      <img src={piq_logo} alt="piq" />
    </div>
  </header>

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
          <h3 style="color: #ff4444;">Confirm Purge</h3>
        </div>
        <div class="modal-content mini-content">
          <p>Are you sure you want to delete all alerts? This action is permanent and cannot be undone.</p>
        </div>
        <div class="modal-footer mini-footer">
          <button class="ghost-btn" on:click={() => showPurgeConfirm = false}>CANCEL</button>
          <button class="action-btn danger-bg" on:click={clearAlerts}>PURGE EVERYTHING</button>
        </div>
      </div>
    </div>
  {/if}

  <main class="grid">
    <section class="panel" in:fade={{duration: 400}}>
      <h2>01. SELECT TARGET</h2>
      <div class="controls">
        <input type="text" bind:value={targetUrl} placeholder="https://..." />
        <button on:click={loadProxy}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          INSPECT
        </button>
      </div>

      <div class="iframe-container {isFullscreen ? 'fullscreen' : ''}">
        <div class="iframe-controls">
          {#if proxyUrl}
            <button class="overlay-btn text-overlay-btn" on:click={toggleInspector} class:active-state={inspectorActive}>
              {inspectorActive ? 'INSPECT: ON' : 'INTERACT'}
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

      <h2>02. COMMIT NODE</h2>
      <div class="commit-header">
        <p>Element: <strong>{selectedSelector || 'NULL'}</strong></p>
        {#if selectedSelector}
          <button class="ghost-btn warning-btn" on:click={pickAgain} in:fade>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
            RE-PICK
          </button>
        {/if}
      </div>
      <input type="text" bind:value={siteName} placeholder="Reference Name" />
      <button on:click={saveTarget} disabled={!selectedSelector}>START TRACKING</button>

      <div class="header-with-spinner" style="margin-top: 2rem;">
        <h2>ACTIVE NODES</h2>
        {#if isSyncing}<div class="spinner" in:fade out:fade></div>{/if}
      </div>

      <ul class="node-list">
        {#each sites as site (site.id)}
          <li class={site.is_frozen ? 'frozen-node' : ''} animate:flip={{duration: 300, easing: cubicOut}} in:fly={{x: -20, duration: 300}} out:slide={{duration: 300}}>
            <div class="node-info">
              <strong>{site.name}</strong>
              {#if site.is_frozen}<span class="badge frozen-badge">FROZEN</span>{/if}
              <br><small>{site.url}</small>
            </div>
            <div class="node-actions">
              <button class="ghost-btn" on:click={() => toggleFreeze(site.id, site.is_frozen)}>
                {site.is_frozen ? 'UNFREEZE' : 'FREEZE'}
              </button>
              <button class="icon-btn delete-icon-btn" on:click={() => deleteTarget(site.id)} title="Delete Node">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>
          </li>
        {/each}
      </ul>
    </section>

    <section class="feed-panel">
      <div class="feed-header">
        <div class="header-with-spinner">
          <h2>{showArchived ? 'ARCHIVE' : 'LIVE FEED'}</h2>
          {#if isSyncing}<div class="spinner" in:fade out:fade></div>{/if}
        </div>
        <div class="feed-actions">
          <button class="ghost-btn" on:click={() => showArchived = !showArchived}>
            {#if showArchived}
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
              LIVE
            {:else}
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
              ARCHIVE
            {/if}
          </button>

          <button class="icon-btn delete-icon-btn" style="color: #ff4444;" on:click={() => showPurgeConfirm = true} title="Purge All">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/></svg>
          </button>
        </div>
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
                <span class="timestamp">{new Date(alert.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <button class="icon-btn delete-icon-btn" on:click={() => deleteAlert(alert.id)} title="Delete Alert">
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
              <button class="ghost-btn expand-btn" on:click={() => activeModalAlert = alert} title="Expand DOM">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
              </button>

              {#if !alert.is_read}
                <button class="action-btn" on:click={() => markAsRead(alert.id)} title="Mark as Seen">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  SEEN
                </button>
              {/if}
            </div>
          </div>
        {/each}

        {#if (showArchived ? archivedAlerts : activeAlerts).length === 0}
          <div class="empty-state" in:fade>NO SIGNALS DETECTED.</div>
        {/if}
      </div>
    </section>
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #0a0a0a; overflow-y: scroll; }

  .app-wrapper {
    --bg-main: #0a0a0a;
    --bg-panel: #111111;
    --bg-card: #1a1a1a;
    --border-color: #222222;
    --text-main: #ffffff;
    --text-muted: #888888;
    --accent: #ffffff;

    min-height: 100vh;
    background: var(--bg-main);
    color: var(--text-main);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  img { width: 15%; }

  h1, h2 { font-weight: 700; margin-top: 0; letter-spacing: -0.5px; }
  h1 { margin: 0; }
  h2 { font-size: 1.2rem; color: var(--text-muted); }

  .top-nav { padding: 1rem 2rem; border-bottom: 1px solid var(--border-color); background: var(--bg-main); }

  .toast { position: fixed; bottom: 20px; left: 20px; z-index: 10000; display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 0.9rem; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
  .toast.error { background: #d32f2f; }
  .toast.success { background: #388e3c; }

  .header-with-spinner { display: flex; align-items: center; gap: 12px; }
  .spinner { width: 16px; height: 16px; border: 2px solid var(--border-color); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; padding: 2rem; max-width: 1400px; margin: 0 auto;}
  .panel { background: var(--bg-panel); padding: 2rem; border-radius: 12px; border: 1px solid var(--border-color); }

  input, button { padding: 0.6rem 1rem; margin: 0.4rem 0; font-family: inherit; font-size: 0.85rem; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 6px; min-height: 36px; width: 100%; box-sizing: border-box; transition: all 0.2s; }
  button { background: var(--accent); color: #000; font-weight: 700; cursor: pointer; border: none; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.danger-bg { background: #ff4444; color: white; border: none; }
  button.danger-bg:hover { background: #d32f2f; }

  .controls { display: flex; gap: 1rem; }
  .controls input { flex: 1; }
  .controls button { width: auto; }

  .icon-btn { background: transparent; border: none; padding: 4px; min-height: auto; width: auto; color: var(--text-muted); margin: 0; display: flex; align-items: center; justify-content: center; }
  .icon-btn:hover { color: var(--text-main); }

  .iframe-container { height: 400px; border: 1px dashed var(--border-color); border-radius: 8px; position: relative; margin: 1.5rem 0; background: #000; transition: all 0.3s ease; }
  iframe { width: 100%; height: 100%; border: none; border-radius: 8px; background: #fff;}
  .placeholder { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-muted); font-family: monospace; }

  .iframe-container.fullscreen { position: fixed; top: 3vh; left: 3vw; width: 94vw; height: 94vh; z-index: 9999; margin: 0; border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 0 0 100vmax rgba(0,0,0,0.85), 0 20px 50px rgba(0,0,0,0.5); }

  .iframe-controls { position: absolute; top: 10px; right: 10px; z-index: 10000; display: flex; gap: 8px; }
  .overlay-btn { background: rgba(0,0,0,0.7); color: white; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; backdrop-filter: blur(4px); }
  .text-overlay-btn { padding: 4px 12px; font-weight: bold; font-size: 0.75rem; letter-spacing: 0.5px; }
  .text-overlay-btn.active-state { color: #ffaa00; border-color: #ffaa00; box-shadow: 0 0 8px rgba(255, 170, 0, 0.2); }

  .commit-header { display: flex; justify-content: space-between; align-items: center; }

  .node-list { list-style: none; padding: 0; margin: 0; }
  .node-list li { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border: 1px solid var(--border-color); margin-bottom: 0.5rem; border-radius: 6px; background: var(--bg-main); transition: opacity 0.3s ease; }
  .node-list li.frozen-node { opacity: 0.5; border-style: dashed; }
  .node-info { flex: 1; overflow: hidden; text-overflow: ellipsis; }
  .node-actions { display: flex; gap: 0.5rem; align-items: center; }

  .delete-icon-btn:hover { color: #ff4444; }

  .feed-panel { background: transparent; border: none; padding: 0; }
  .feed-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); margin-bottom: 2rem; }
  .feed-actions { display: flex; gap: 0.5rem; align-items: center; }

  .ghost-btn { background: transparent; color: var(--text-muted); border: 1px solid var(--border-color); width: auto; display: inline-flex; align-items: center; justify-content: center; }
  .ghost-btn:hover { background: var(--bg-card); color: var(--text-main); }
  .ghost-btn.warning-btn { color: #ffaa00; border-color: rgba(255,170,0,0.3); margin: 0; }

  .alerts-list { display: flex; flex-direction: column; gap: 2rem; }
  .media-card { background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); }
  .card-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); }
  .header-left, .header-right { display: flex; align-items: center; gap: 10px; }

  .badge { font-family: monospace; background: #2a2a2a; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; }
  .link-badge { text-decoration: none; color: var(--accent); transition: background 0.2s; }
  .link-badge:hover { background: #3a3a3a; }
  .frozen-badge { background: rgba(0, 102, 255, 0.2); color: #0066ff; margin-left: 0.5rem; }
  .outdated-badge { background: rgba(255, 170, 0, 0.15); color: #ffaa00; font-size: 0.75rem; border: 1px solid rgba(255, 170, 0, 0.3); }

  .timestamp { color: var(--text-muted); font-size: 0.85rem; }

  /* Modals */
  .modal-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 2rem; box-sizing: border-box; backdrop-filter: blur(4px); }
  .modal-card { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); width: 100%; max-width: 900px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.7); }
  .modal-card.mini-modal { max-width: 400px; max-height: auto; }
  .modal-header { padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
  .modal-header h3 { margin: 0; font-family: monospace; }
  .modal-content { padding: 0; background: #000; overflow-y: auto; display: flex; justify-content: center; align-items: center; min-height: 200px; flex-direction: column; }
  .modal-content.mini-content { background: var(--bg-card); min-height: auto; padding: 1rem 2rem 2rem 2rem; text-align: center; color: var(--text-muted); }
  .modal-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--border-color); }
  .modal-footer.mini-footer { display: flex; gap: 1rem; border-top: none; padding-top: 0; }

  .card-content { background: #000; position: relative; }
  .card-content.clamped-view { height: 180px; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start; }

  .html-wrapper { width: 100%; padding: 1rem; box-sizing: border-box; }
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

  .empty-state { text-align: center; padding: 4rem 2rem; color: var(--text-muted); font-family: monospace; border: 1px dashed var(--border-color); border-radius: 12px; }

  @media (max-width: 768px) {
    .grid { grid-template-columns: 1fr; padding: 1rem; }
    .controls { flex-direction: column; }
    .iframe-container.fullscreen { width: 100vw; height: 100vh; top: 0; left: 0; border-radius: 0; }
    .modal-backdrop { padding: 0.5rem; }
  }
</style>