<script>
  import { onMount } from 'svelte';
  import piq_logo from './assets/piq-logo.png'

  const API_BASE = '/api'; // for single server routing

  let targetUrl = '';
  let proxyUrl = '';
  let siteName = '';
  let selectedSelector = '';

  let alerts = [];
  let sites = [];
  let isFullscreen = false;
  let showArchived = false;

  $: activeAlerts = alerts.filter(a => !a.is_read);
  $: archivedAlerts = alerts.filter(a => a.is_read);

  onMount(() => {
    fetchSites();
    fetchAlerts();

    const pollInterval = setInterval(() => {
      fetchAlerts();
    }, 5000);

    window.addEventListener('message', (event) => {
      if (event.data.type === 'SELECTOR_PICKED') {
        selectedSelector = event.data.selector;
      }
    });

    return () => clearInterval(pollInterval);
  });

  async function fetchSites() {
    const res = await fetch(`${API_BASE}/sites`);
    if (res.ok) sites = await res.json();
  }

  async function fetchAlerts() {
    const res = await fetch(`${API_BASE}/alerts`);
    if (res.ok) alerts = await res.json();
  }

  function loadProxy() {
    if (!targetUrl) return;
    proxyUrl = `${API_BASE}/proxy?url=${encodeURIComponent(targetUrl)}`;
    selectedSelector = '';
  }

  async function saveTarget() {
    if (!siteName || !targetUrl || !selectedSelector) return;
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

  async function markAsRead(id) {
    await fetch(`${API_BASE}/alerts/${id}/read`, { method: 'PATCH' });
    alerts = alerts.map(a => a.id === id ? { ...a, is_read: 1 } : a);
  }

  async function clearAlerts() {
    await fetch(`${API_BASE}/alerts`, { method: 'DELETE' });
    fetchAlerts();
  }
</script>

<div class="app-wrapper">
  <header class="top-nav">
    <div class="brand">
      <img src={piq_logo} alt="piq" />
    </div>
  </header>

  <main class="grid">
    <section class="panel">
      <h2>01. SELECT TARGET</h2>
      <div class="controls">
        <input type="text" bind:value={targetUrl} placeholder="https://..." />
        <button on:click={loadProxy}>INSPECT</button>
      </div>

      <div class="iframe-container {isFullscreen ? 'fullscreen' : ''}">
        <div class="iframe-controls">
          <button on:click={() => isFullscreen = !isFullscreen}>
            {isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}
          </button>
        </div>
        {#if proxyUrl}
          <iframe src={proxyUrl} title="Proxy"></iframe>
        {:else}
          <div class="placeholder">AWAITING TARGET</div>
        {/if}
      </div>

      <h2>02. COMMIT NODE</h2>
      <p>Element: <strong>{selectedSelector || 'NULL'}</strong></p>
      <input type="text" bind:value={siteName} placeholder="Reference Name" />
      <button on:click={saveTarget} disabled={!selectedSelector}>START TRACKING</button>

      <h2 style="margin-top: 2rem;">ACTIVE NODES</h2>
      <ul class="node-list">
        {#each sites as site}
          <li>
            <div>
              <strong>{site.name}</strong> <br><small>{site.url}</small>
            </div>
            <button class="delete-btn" on:click={() => deleteTarget(site.id)}> X </button>
          </li>
        {/each}
      </ul>
    </section>

    <section class="feed-panel">
      <div class="feed-header">
        <h2>{showArchived ? 'ARCHIVE' : 'LIVE FEED'}</h2>
        <div class="feed-actions">
          <button class="ghost-btn" on:click={() => showArchived = !showArchived}>
            {showArchived ? 'SHOW LIVE' : 'SHOW ARCHIVE'}
          </button>
          <button class="ghost-btn danger" on:click={clearAlerts}>PURGE ALL</button>
        </div>
      </div>

      <div class="alerts-list">
        {#each (showArchived ? archivedAlerts : activeAlerts) as alert (alert.id)}
          <div class="media-card">
            <div class="card-header">
              <span class="badge">{alert.name}</span>
              <span class="timestamp">{new Date(alert.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>

            <div class="card-content">
              {@html alert.captured_html}
            </div>

            {#if !alert.is_read}
              <div class="card-footer">
                <button class="action-btn" on:click={() => markAsRead(alert.id)}>MARK AS SEEN</button>
              </div>
            {/if}
          </div>
        {/each}

        {#if (showArchived ? archivedAlerts : activeAlerts).length === 0}
          <div class="empty-state">NO SIGNALS DETECTED.</div>
        {/if}
      </div>
    </section>
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #0a0a0a; }

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
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; padding: 2rem; max-width: 1400px; margin: 0 auto;}
  .panel { background: var(--bg-panel); padding: 2rem; border-radius: 12px; border: 1px solid var(--border-color); }

  input, button {
    padding: 0.8rem;
    margin: 0.5rem 0;
    font-family: inherit;
    background: var(--bg-main);
    color: var(--text-main);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    min-height: 44px;
    width: 100%;
    box-sizing: border-box;
  }
  button { background: var(--accent); color: #000; font-weight: 700; cursor: pointer; border: none; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .controls { display: flex; gap: 1rem; }
  .controls input { flex: 1; }
  .controls button { width: auto; }

  .iframe-container { height: 400px; border: 1px dashed var(--border-color); border-radius: 8px; position: relative; margin: 1.5rem 0; background: #000; }
  iframe { width: 100%; height: 100%; border: none; border-radius: 8px; }
  .placeholder { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-muted); font-family: monospace; }

  .iframe-container.fullscreen {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; margin: 0; border: none; border-radius: 0;
  }
  .iframe-controls { position: absolute; top: 10px; right: 10px; z-index: 10000; }
  .iframe-controls button { padding: 0.5rem 1rem; min-height: auto; width: auto; }

  .node-list { list-style: none; padding: 0; margin: 0; }
  .node-list li { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border: 1px solid var(--border-color); margin-bottom: 0.5rem; border-radius: 6px; background: var(--bg-main); }
  .delete-btn { background: transparent; border: 1px solid #ff4444; color: #ff4444; width: auto; padding: 0.5rem; }

  .feed-panel { background: transparent; border: none; padding: 0; }
  .feed-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); margin-bottom: 2rem; }

  .ghost-btn { background: transparent; color: var(--text-muted); border: 1px solid var(--border-color); font-size: 0.8rem; width: auto; padding: 0.5rem 1rem; }
  .ghost-btn.danger { color: #ff4444; border-color: rgba(255,68,68,0.3); }

  .alerts-list { display: flex; flex-direction: column; gap: 2rem; }
  .media-card { background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); }
  .card-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); }
  .badge { font-family: monospace; background: #2a2a2a; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; }
  .timestamp { color: var(--text-muted); font-size: 0.85rem; }

  .card-content { padding: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100px; overflow: hidden; }
  .card-content :global(img), .card-content :global(video) { width: 100%; height: auto; max-height: 600px; object-fit: contain; display: block; }
  .card-content :global(nav), .card-content :global(footer), .card-content :global(script) { display: none !important; }
  .card-content :global(a) { color: var(--accent); padding: 1rem; display: block; word-break: break-all; }

  .card-footer { padding: 1rem 1.5rem; background: var(--bg-card); border-top: 1px solid var(--border-color); }
  .action-btn { margin: 0; }

  .empty-state { text-align: center; padding: 4rem 2rem; color: var(--text-muted); font-family: monospace; border: 1px dashed var(--border-color); border-radius: 12px; }

  @media (max-width: 768px) {
    .grid { grid-template-columns: 1fr; padding: 1rem; }
    .controls { flex-direction: column; }
  }
</style>