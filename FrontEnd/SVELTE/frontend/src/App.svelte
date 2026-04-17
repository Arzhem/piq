<script>
  import { onMount } from 'svelte';

  const API_BASE = 'http://localhost:3000/api';

  let targetUrl = 'https://example.com';
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
        console.log("CSS Selector:", selectedSelector);
      }
    });
  });

  async function fetchSites() {
    try {
      const res = await fetch(`${API_BASE}/sites`);
      sites = await res.json();
    } catch (err) {
      console.error("API Connection Error", err);
    }
  }

  async function fetchAlerts() {
    try {
      const res = await fetch(`${API_BASE}/alerts`);
      alerts = await res.json();
    } catch (err) {
      console.error("API Connection Error", err);
    }
  }

  function loadProxy() {
    if (!targetUrl) return;
    proxyUrl = `${API_BASE}/proxy?url=${encodeURIComponent(targetUrl)}`;
    selectedSelector = '';
  }

  async function saveTarget() {
    if (!siteName || !targetUrl || !selectedSelector) {
      alert("ERROR: Missing required parameters (Name, URL, Selector).");
      return;
    }

    const res = await fetch(`${API_BASE}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: siteName,
        url: targetUrl,
        css_selector: selectedSelector
      })
    });

    if (res.ok) {
      siteName = '';
      selectedSelector = '';
      proxyUrl = '';
      fetchSites();
    }
  }

  function toggleTheme() {
    isLightTheme = !isLightTheme;
  }
</script>

<div class="app-wrapper" data-theme={isLightTheme ? 'light' : 'dark'}>
  <header class="top-nav">
    <div class="brand">
      <h1>piq</h1>
      <span class="status-badge">ONLINE</span>
    </div>
    <button class="theme-toggle" on:click={toggleTheme}>
      {isLightTheme ? 'DARK MODE' : 'LIGHT MODE'}
    </button>
  </header>

  <main class="dashboard">
    <div class="grid">
      <section class="panel">
        <div class="panel-header">
          <h2>01. Select what you want to monitor</h2>
        </div>

        <div class="controls">
          <input type="text" bind:value={targetUrl} placeholder="Input URL: https://..." />
          <button class="btn-primary" on:click={loadProxy}>START INSPECTOR</button>
        </div>

        <div class="iframe-container">
          {#if proxyUrl}
            <iframe src={proxyUrl} title="Proxy"></iframe>
          {:else}
            <div class="placeholder">[ AWAITING URL ]</div>
          {/if}
        </div>

        <div class="save-form">
          <div class="panel-header">
            <h2>02. Commit target selector</h2>
          </div>
          <div class="selector-display">
            <span class="label">Selected Element:</span>
            <span class="value">{selectedSelector || 'NULL'}</span>
          </div>
          <input type="text" bind:value={siteName} placeholder="INPUT_TARGET_DESIGNATION" />
          <button class="btn-primary" on:click={saveTarget} disabled={!selectedSelector}>
            START
          </button>
        </div>
      </section>

      <div class="data-column">
        <section class="panel">
          <div class="panel-header">
            <h2>Tracking Nodes [{sites.length}]</h2>
          </div>
          <ul class="site-list">
            {#each sites as site}
              <li>
                <span class="site-name">{site.name}</span>
                <span class="site-url">{site.url}</span>
              </li>
            {/each}
            {#if sites.length === 0}
              <li class="empty-state">NO ACTIVE NODES</li>
            {/if}
          </ul>
        </section>

        <section class="panel">
          <div class="panel-header alert-header">
            <h2>ISSUES</h2>
          </div>
          <div class="alerts-list">
            {#each alerts as alert}
              <div class="alert-card">
                <div class="alert-meta">
                  <h4>{alert.name}</h4>
                  <span class="timestamp">{new Date(alert.created_at).toISOString()}</span>
                </div>
                <div class="captured-content">
                  {@html alert.captured_html}
                </div>
              </div>
            {/each}
            {#if alerts.length === 0}
              <div class="empty-state">Successful.</div>
            {/if}
          </div>
        </section>
      </div>
    </div>
  </main>
</div>

<style>
  .app-wrapper {
    --bg-main: #050505;
    --bg-panel: #0f0f11;
    --border-color: #333;
    --text-main: #ffffff;
    --text-muted: #888888;
    --accent: #0066ff;
    --accent-hover: #0052cc;
    --alert: #ff2a2a;
    --alert-bg: rgba(255, 42, 42, 0.1);
    --font-sans: 'Inter', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', 'Courier New', monospace;

    min-height: 100vh;
    background-color: var(--bg-main);
    color: var(--text-main);
    font-family: var(--font-sans);
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  .app-wrapper[data-theme='light'] {
    --bg-main: #f0f0f2;
    --bg-panel: #ffffff;
    --border-color: #cccccc;
    --text-main: #111111;
    --text-muted: #666666;
    --accent: #0055d4;
    --accent-hover: #0044aa;
    --alert: #d40000;
    --alert-bg: rgba(212, 0, 0, 0.05);
  }

  :global(body) { margin: 0; padding: 0; background-color: #050505; }

  h1, h2, h3, h4 { margin: 0; font-weight: 600; letter-spacing: 1px; }

  .top-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--bg-panel);
  }

  .brand { display: flex; align-items: center; gap: 1rem; }
  .brand h1 { font-size: 1.2rem; margin: 0; }
  .status-badge {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: #00ff00;
    border: 1px solid #00ff00;
    padding: 0.2rem 0.5rem;
    border-radius: 2px;
  }

  .theme-toggle {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border-color);
    padding: 0.5rem 1rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  .theme-toggle:hover { color: var(--text-main); border-color: var(--text-main); }

  .dashboard { max-width: 1600px; margin: 0 auto; padding: 2rem; }
  .grid { display: grid; grid-template-columns: 1fr 500px; gap: 2rem; }

  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .panel-header {
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 0.5rem;
    margin-bottom: 1.5rem;
  }
  .panel-header h2 { font-size: 1rem; color: var(--text-muted); }
  .alert-header h2 { color: var(--alert); }

  .controls, .save-form { display: flex; flex-direction: column; gap: 1rem; }

  input {
    background: var(--bg-main);
    color: var(--text-main);
    border: 1px solid var(--border-color);
    padding: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.9rem;
    outline: none;
    border-radius: 0;
  }
  input:focus { border-color: var(--accent); }

  .btn-primary {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.9rem;
    cursor: pointer;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { background: var(--border-color); color: var(--text-muted); cursor: not-allowed; }

  .iframe-container {
    height: 500px;
    border: 1px solid var(--border-color);
    background: var(--bg-main);
    margin: 1.5rem 0;
    position: relative;
  }
  iframe { width: 100%; height: 100%; border: none; }
  .placeholder {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    font-family: var(--font-mono);
    color: var(--text-muted);
  }

  .selector-display {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    padding: 0.5rem;
    background: var(--bg-main);
    border: 1px solid var(--border-color);
  }
  .selector-display .label { color: var(--text-muted); }
  .selector-display .value { color: var(--accent); font-weight: bold; }

  .site-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .site-list li {
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    background: var(--bg-main);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .site-name { font-weight: bold; font-size: 0.9rem; }
  .site-url { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); }

  .alerts-list { display: flex; flex-direction: column; gap: 1rem; }
  .alert-card {
    border: 1px solid var(--alert);
    background: var(--alert-bg);
  }
  .alert-meta {
    padding: 0.75rem;
    border-bottom: 1px solid var(--alert);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .alert-meta h4 { color: var(--alert); font-size: 0.9rem; }
  .timestamp { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); }

  .captured-content {
    padding: 1rem;
    background: var(--bg-main);
    font-family: var(--font-sans);
    font-size: 0.9rem;
    overflow-x: auto;
  }

  .empty-state {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: center;
    padding: 2rem;
    border: 1px dashed var(--border-color);
  }
</style>