<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  
  import { token, sites, sortedSites, unreadCounts, toast, isSyncing } from './store.js';
  import { getHostname } from './utils.js';

  const dispatch = createEventDispatcher();
  const API_BASE = '/api';

  let targetUrl = '';
  let proxyUrl = '';
  let siteName = '';
  let selectedSelector = '';
  let checkInterval = "600";

  let isFullscreen = false;
  let inspectorActive = true;
  let iframeRef;

  async function authFetch(url, options = {}) {
    options.headers = { ...options.headers, 'Authorization': `Bearer ${$token}` };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) { 
      $token = ''; 
      throw new Error("Unauthorized or Session Expired"); 
    }
    return res;
  }

  // Refetches sites and updates the global store
  async function fetchSites() {
    try { 
      const res = await authFetch(`${API_BASE}/sites`); 
      if (res.ok) $sites = await res.json(); 
    } catch (e) { 
      console.error(e); 
    }
  }

  onMount(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'SELECTOR_PICKED') { 
        selectedSelector = event.data.selector; 
        toast.set({ visible: true, message: 'Element targeted.', type: 'success' });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });

  function loadProxy() { 
    if (!targetUrl) return; 
    proxyUrl = `${API_BASE}/proxy?url=${encodeURIComponent(targetUrl)}&token=${$token}`; 
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

  function handleAddClick() {
    if (!siteName || !targetUrl || !selectedSelector) return;
    const normalizedUrl = targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl;
    const cleanUrl = normalizedUrl.replace(/\/$/, '').toLowerCase();
    const cleanSelector = selectedSelector.trim();

    const isDuplicate = $sites.some(s => s.url.replace(/\/$/, '').toLowerCase() === cleanUrl && s.css_selector.trim() === cleanSelector);
    
    if (isDuplicate) {
      // Ask App.svelte to show the confirm modal
      dispatch('requestConfirm', {
        title: "Duplicate Tracker",
        message: "You are already monitoring this exact element on this page. Create a duplicate anyway?",
        actionText: "TRACK ANYWAY",
        onConfirm: saveTarget
      });
    } else {
      saveTarget();
    }
  }

  async function saveTarget() {
    $isSyncing = true;
    try {
      const res = await authFetch(`${API_BASE}/sites`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: siteName, url: targetUrl, css_selector: selectedSelector, interval: parseInt(checkInterval) })
      });
      if (res.ok) { 
        siteName = ''; 
        selectedSelector = ''; 
        proxyUrl = ''; 
        await fetchSites(); 
        toast.set({ visible: true, message: 'Tracker active.', type: 'success' });
      }
    } finally {
      $isSyncing = false;
    }
  }
</script>

<aside class="right-panel desktop-only">
  <div class="inspector-section">
    <h2>New Tracker</h2>
    <div class="controls">
      <input type="text" bind:value={targetUrl} placeholder="https://..." on:keydown={e => e.key === 'Enter' && loadProxy()} />
      <button on:click={loadProxy}>INSPECT</button>
    </div>

    <div class="iframe-container {isFullscreen ? 'fullscreen' : ''}">
      <div class="iframe-controls">
        {#if proxyUrl}
          <button class="overlay-btn text-overlay-btn" on:click={toggleInspector} class:active-state={inspectorActive}>{inspectorActive ? 'INSPECT' : 'INTERACT'}</button>
        {/if}
        <button class="icon-btn overlay-btn" on:click={() => isFullscreen = !isFullscreen}>
          {#if isFullscreen}<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
          {:else}<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>{/if}
        </button>
      </div>
      {#if proxyUrl}<iframe bind:this={iframeRef} class="proxy-iframe" src={proxyUrl} title="Proxy" in:fade></iframe>
      {:else}<div class="placeholder">AWAITING TARGET</div>{/if}
    </div>

    <div class="commit-header">
      <p>Node: <strong>{selectedSelector || 'NULL'}</strong></p>
      {#if selectedSelector}<button class="ghost-btn warning-btn" on:click={pickAgain}>RE-PICK</button>{/if}
    </div>
    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
      <input type="text" bind:value={siteName} placeholder="Ref Name" style="margin: 0;"/>

      <select bind:value={checkInterval} style="width: auto; margin: 0;">
        <option value="10">10s</option>
        <option value="60">1m</option>
        <option value="300">5m</option>
        <option value="600">10m</option>
        <option value="3600">1h</option>
        <option value="86400">24h</option>
      </select>

      <button on:click={handleAddClick} disabled={!selectedSelector} style="margin: 0;">ADD</button>
    </div>
  </div>

  <div class="nodes-section">
    <h2>Active Trackers</h2>
    <ul class="node-list" style="margin-top: 1rem;">
      {#each $sortedSites as site (site.id)}
        <li class="interactive-node {site.is_frozen ? 'frozen-node' : ''}" animate:flip={{duration: 300}} in:fly={{x: 20, duration: 300}} out:slide on:click={() => dispatch('editNode', site)}>
          <div class="node-info">
            <span class="status-pulse {site.is_frozen ? 'frozen' : 'active'}"></span>

            <img src="https://www.google.com/s2/favicons?domain={getHostname(site.url)}&sz=32" alt="" class="site-favicon" />
            <strong>{site.name}</strong>

            {#if site.last_error}
              <span class="badge" style="background: rgba(255,170,0,0.1); color: #ffaa00; margin-left:8px; border: 1px solid rgba(255,170,0,0.3);">ISSUE</span>
            {:else if $unreadCounts[site.id]}
              <span class="badge" style="background: var(--text-main); color: var(--bg-main); margin-left: 8px;">{$unreadCounts[site.id]} NEW</span>
            {/if}

            {#if site.is_frozen}<span class="badge frozen-badge">FROZEN</span>{/if}
          </div>

          <div class="edit-hint">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
          </div>
        </li>
      {/each}
      {#if $sites.length === 0}<div class="empty-state mini-empty" in:fade>No trackers active.</div>{/if}
    </ul>
  </div>
</aside>
