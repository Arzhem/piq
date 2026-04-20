<script>
  import { onMount } from 'svelte';

  const API_BASE = 'http://localhost:3000/api';

  let targetUrl = '';
  let proxyUrl = '';
  let siteName = '';
  let selectedSelector = '';

  let alerts = [];
  let sites = [];
  let isLightTheme = false;

  onMount(() => {
    fetchSites();
    fetchAlerts();

    window.addEventListener('message', (event) => {
      if (event.data.type === 'SELECTOR_PICKED') {
        selectedSelector = event.data.selector;
      }
    });
  });

  async function fetchSites() {
    const res = await fetch(`${API_BASE}/sites`);
    sites = await res.json();
  }

  async function fetchAlerts() {
    const res = await fetch(`${API_BASE}/alerts`);
    alerts = await res.json();
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
    fetchAlerts(); // cascades deletes alerts too
  }

  async function clearAlerts() {
    await fetch(`${API_BASE}/alerts`, { method: 'DELETE' });
    fetchAlerts();
  }
</script>

<div class="app-wrapper" data-theme={isLightTheme ? 'light' : 'dark'}>
  <header class="top-nav">
    <div class="brand">
      <h1>piq</h1>
    </div>
    <button on:click={() => isLightTheme = !isLightTheme}>
      {isLightTheme ? 'DARK THEME' : 'LIGHT THEME'}
    </button>
  </header>

  <main class="grid">
    <section class="panel">
      <h2>01. SELECT WHAT YOU WANT TO TRACK</h2>
      <div class="controls">
        <input type="text" bind:value={targetUrl} placeholder="Input URL: https://..." />
        <button on:click={loadProxy}>INSPECTOR</button>
      </div>

      <div class="iframe-container">
        {#if proxyUrl}
          <iframe src={proxyUrl} title="Proxy"></iframe>
        {:else}
          <div class="placeholder">[ AWAITING TARGET URL ]</div>
        {/if}
      </div>

      <h2>02. COMMIT SELECTOR</h2>
      <p>Element: <strong>{selectedSelector || 'NULL'}</strong></p>
      <input type="text" bind:value={siteName} placeholder="INPUT_TARGET_DESIGNATION" />
      <button on:click={saveTarget} disabled={!selectedSelector}>Start Tracking</button>

      <h2 style="margin-top: 2rem;">Active Nodes</h2>
      <ul>
        {#each sites as site}
          <li>
            {site.name} <br><small>{site.url}</small>
            <button class="delete-btn" on:click={() => deleteTarget(site.id)}>[X]</button>
          </li>
        {/each}
      </ul>
    </section>

    <section class="panel feed-panel">
      <div class="feed-header">
        <h2>Errors (Feed)</h2>
        <button on:click={clearAlerts}>CLEAR ALL</button>
      </div>

      <div class="alerts-list">
        {#each alerts as alert}
          <div class="alert-card">
            <div class="alert-meta">{alert.name} - {new Date(alert.created_at).toLocaleTimeString()}</div>
            <div class="captured-content">
              {@html alert.captured_html}
            </div>
          </div>
        {/each}
      </div>
    </section>
  </main>
</div>

<style>
  .app-wrapper {
    --bg-main: #050505; --bg-panel: #0f0f11; --border-color: #333;
    --text-main: #fff; --accent: #0066ff;
    min-height: 100vh; background: var(--bg-main); color: var(--text-main);
    font-family: monospace;
  }
  .app-wrapper[data-theme='light'] {
    --bg-main: #f0f0f2; --bg-panel: #fff; --border-color: #ccc;
    --text-main: #111; --accent: #0055d4;
  }
  .top-nav { display: flex; justify-content: space-between; padding: 1rem; border-bottom: 1px solid var(--border-color); background: var(--bg-panel); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; padding: 2rem; max-width: 1400px; margin: 0 auto;}
  .panel { background: var(--bg-panel); padding: 1.5rem; border: 1px solid var(--border-color); }
  input, button { padding: 0.5rem; margin: 0.5rem 0; font-family: monospace; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); }
  button { background: var(--accent); color: white; cursor: pointer; border: none; }
  .iframe-container { height: 400px; border: 1px dashed var(--border-color); position: relative; margin: 1rem 0; }
  iframe { width: 100%; height: 100%; border: none; }
  .placeholder { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #888; }

  /* Social Feed Styles */
  .alerts-list { display: flex; flex-direction: column; gap: 2rem; margin-top: 1rem; }
  .alert-card { border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: var(--bg-main); }
  .alert-meta { padding: 0.75rem; border-bottom: 1px solid var(--border-color); font-weight: bold; color: var(--accent); }
  .captured-content { padding: 0; }
  .captured-content :global(img) { width: 100%; height: auto; max-height: 300px; object-fit: cover; }
  .captured-content :global(a) { color: var(--text-main); text-decoration: none; padding: 1rem; display: block; }
  .captured-content :global(nav), .captured-content :global(footer), .captured-content :global(script) { display: none !important; }

  .delete-btn { background: transparent; border: 1px solid red; color: red; padding: 2px 5px; float: right; }
  .feed-header { display: flex; justify-content: space-between; align-items: center; }
</style>