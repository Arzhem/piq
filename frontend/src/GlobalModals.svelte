<script>
  import { fade } from 'svelte/transition';
  import { token, sites, alerts, toast, isSyncing } from './store.js';

  export let editingNode = null;
  export let activeModalAlert = null;
  export let confirmDialog = { visible: false, title: '', message: '', actionText: '', onConfirm: null };

  const API_BASE = '/api';

  async function authFetch(url, options = {}) {
    options.headers = { ...options.headers, 'Authorization': `Bearer ${$token}` };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) { $token = ''; throw new Error("Unauthorized"); }
    return res;
  }

  async function fetchSites() {
    const res = await authFetch(`${API_BASE}/sites`);
    if (res.ok) $sites = await res.json();
  }

  async function fetchAlerts() {
    const res = await authFetch(`${API_BASE}/alerts`);
    if (res.ok) $alerts = await res.json();
  }

  async function updateNode(node) {
    $isSyncing = true;
    try {
      const res = await authFetch(`${API_BASE}/sites/${node.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: node.name, check_interval_seconds: parseInt(node.check_interval_seconds) })
      });
      if (res.ok) { 
        editingNode = null; 
        await fetchSites(); 
        toast.set({ visible: true, message: 'Tracker updated.', type: 'success' }); 
      }
    } catch (err) { console.error(err); } finally { $isSyncing = false; }
  }

  async function deleteTarget(id) { 
    await authFetch(`${API_BASE}/sites/${id}`, { method: 'DELETE' }); 
    editingNode = null; 
    confirmDialog.visible = false; 
    await fetchSites(); 
    await fetchAlerts(); 
  }

  async function toggleFreeze(id, currentState) { 
    await authFetch(`${API_BASE}/sites/${id}/freeze`, { 
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ is_frozen: !currentState }) 
    }); 
    await fetchSites(); 
  }

  async function markAsRead(id) { 
    await authFetch(`${API_BASE}/alerts/${id}/read`, { method: 'PATCH' }); 
    $alerts = $alerts.map(a => a.id === id ? { ...a, is_read: 1 } : a); 
    if (activeModalAlert && activeModalAlert.id === id) activeModalAlert.is_read = 1; 
  }

  async function executeConfirm() {
    if (confirmDialog.onConfirm) {
      try { await confirmDialog.onConfirm(); } catch (e) { console.error("Confirmation action failed:", e); }
    }
    confirmDialog.visible = false;
  }

  function handleModalMediaClick(e) {
    const anchor = e.target.closest('a');
    if (anchor) {
      let href = anchor.getAttribute('href');
      if (href && !href.startsWith('javascript:')) {
        e.preventDefault(); e.stopPropagation(); window.open(href, '_blank'); return;
      }
    }

    const mediaEl = e.target.closest('video, img');
    if (mediaEl) {
      let src = mediaEl.getAttribute('src') || mediaEl.currentSrc;
      if (!src) {
        const source = mediaEl.querySelector('source');
        if (source) src = source.getAttribute('src');
      }
      if (!src && mediaEl.tagName.toLowerCase() === 'video') src = mediaEl.getAttribute('poster');

      if (src && !src.startsWith('data:')) {
        e.preventDefault(); e.stopPropagation(); window.open(src, '_blank');
      }
    }
  }
</script>

{#if editingNode}
  <div class="modal-backdrop soft-backdrop" in:fade={{duration: 200}} out:fade={{duration: 200}} on:click={() => editingNode = null}>
    <div class="modal-card mini-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Tracker Settings</h3>
        <button class="icon-btn close-btn" on:click={() => editingNode = null}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="modal-content mini-content" style="text-align: left;">
        <label style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">TRACKER NAME</label>
        <input type="text" bind:value={editingNode.name} style="margin-bottom: 1.5rem; margin-top: 0.25rem;" />

        <label style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">CHECK INTERVAL</label>
        <select bind:value={editingNode.check_interval_seconds} style="margin-bottom: 1.5rem; margin-top: 0.25rem;">
          <option value={10}>10 Seconds</option>
          <option value={60}>1 Minute</option>
          <option value={300}>5 Minutes</option>
          <option value={600}>10 Minutes</option>
          <option value={3600}>1 Hour</option>
          <option value={86400}>24 Hours</option>
        </select>

        {#if editingNode.last_error}
          <div class="auth-error" style="margin-bottom: 1rem; text-align: left;">
            <strong style="color: #ff4444;">Connection Interrupted:</strong><br>
            <span style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted);">
              {editingNode.last_error}
            </span>
          </div>
        {/if}

        <p style="overflow-wrap: anywhere; word-break: break-word; font-size: 0.85rem;"><strong>URL:</strong> <a href="{editingNode.url}" target="_blank" class="node-url-link">{editingNode.url}</a></p>
        <p style="font-family: monospace; font-size: 0.75rem; background: var(--bg-main); padding: 8px; border-radius: 4px; color: var(--text-muted);">{editingNode.css_selector}</p>
      </div>
      <div class="modal-footer mini-footer" style="flex-direction: column; gap: 0.5rem;">
        <button class="action-btn" style="width: 100%; margin: 0;" on:click={() => updateNode(editingNode)}>SAVE CHANGES</button>
        <div style="display: flex; justify-content: space-between; gap: 0.5rem; width: 100%;">
          <button class="ghost-btn" style="flex:1;" on:click={() => { toggleFreeze(editingNode.id, editingNode.is_frozen); editingNode.is_frozen = !editingNode.is_frozen; }}>
            {editingNode.is_frozen ? 'UNFREEZE' : 'FREEZE'}
          </button>
          <button class="ghost-btn" style="flex:1; color: #ff4444; border-color: rgba(255,68,68,0.3);" on:click={() => requestConfirm("Delete Tracker", `Remove ${editingNode.name} permanently?`, "DELETE", () => deleteTarget(editingNode.id))}>
            DELETE
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if activeModalAlert}
  <div class="modal-backdrop soft-backdrop" in:fade={{duration: 200}} out:fade={{duration: 200}} on:click={() => activeModalAlert = null}>
    <div class="modal-card" on:click|stopPropagation>
      <div class="modal-header">
        <h3>{activeModalAlert.name}</h3>
        <button class="icon-btn close-btn" on:click={() => activeModalAlert = null}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="modal-content" style="justify-content: flex-start; padding-top: 1rem;" on:click={handleModalMediaClick}>
        <div class="thread-container">
          {#each [activeModalAlert, ...(activeModalAlert.thread || [])] as threadItem, index}
            <div class="thread-item {index === 0 ? 'latest-thread-item' : 'older-thread-item'}">
              <div class="thread-timestamp">
                {#if index === 0}
                  <span class="status-pulse active" style="margin-right: 8px; width: 8px; height: 8px;"></span>
                {/if}
                {new Date(threadItem.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(threadItem.created_at).toLocaleDateString()}
              </div>
              <div class="thread-html">{@html threadItem.captured_html}</div>
            </div>
          {/each}
        </div>
      </div>
      {#if !activeModalAlert.is_read}
        <div class="modal-footer">
          <button class="ghost-btn seen-btn" style="width: 100%; margin: 0;" on:click={() => {
              markAsRead(activeModalAlert.id);
              if(activeModalAlert.thread) activeModalAlert.thread.forEach(t => markAsRead(t.id));
              activeModalAlert = null;
            }}>MARK AS SEEN</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if confirmDialog.visible}
  <div class="modal-backdrop soft-backdrop" in:fade={{duration: 200}} out:fade={{duration: 200}} on:click={() => confirmDialog.visible = false}>
    <div class="modal-card mini-modal" on:click|stopPropagation>
      <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0;">
        <h3 style="color: #ff4444;">{confirmDialog.title}</h3>
      </div>
      <div class="modal-content mini-content">
        <p>{confirmDialog.message}</p>
      </div>
      <div class="modal-footer mini-footer">
        <button class="ghost-btn" on:click={() => confirmDialog.visible = false}>CANCEL</button>
        <button class="action-btn danger-bg" on:click={executeConfirm}>{confirmDialog.actionText}</button>
      </div>
    </div>
  </div>
{/if}
