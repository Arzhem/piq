<script>
  import { fade } from 'svelte/transition';
  import { createEventDispatcher } from 'svelte';
  import { theme, token, sites, alerts } from './store.js';

  const dispatch = createEventDispatcher();

  // Due to store.js setup, clearing $token automatically removes it from localStorage.
  function logout() { 
    $token = ''; 
    $sites = []; 
    $alerts = []; 
  }
</script>

<main class="settings-page" in:fade={{duration: 200}}>
  <div class="settings-container">
    <h2>WORKSPACE SETTINGS</h2>

    <div class="setting-card" style="margin-bottom: 1rem; align-items: flex-start; flex-direction: column; gap: 1rem;">
      <div class="setting-info" style="width: 100%;">
        <h3 style="display: flex; align-items: center; gap: 8px;">
          <div style="background: var(--accent); color: var(--bg-main); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">
            U
          </div>
          User
        </h3>
        <p style="margin-top: 4px;">Standard SaaS License</p>
      </div>
      <div style="width: 100%; border-top: 1px solid var(--border-color); padding-top: 1rem; display: flex; gap: 1rem;">
        <div style="flex: 1;">
          <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold;">API KEY (READ ONLY)</label>
          <input type="text" value="piq_live_8f92a1b4c3d5e6f7g8h9" disabled style="background: var(--bg-main); color: var(--text-muted); font-family: monospace; margin-top: 4px;" />
        </div>
      </div>
    </div>

    <div class="setting-card" style="margin-bottom: 1rem;">
      <div class="setting-info"><h3>Appearance</h3><p>Select your preferred UI theme.</p></div>
      <div class="setting-control">
        <select bind:value={$theme}>
          <option value="dark">Deep Space (Dark)</option>
          <option value="light">Clean Canvas (Light)</option>
        </select>
      </div>
    </div>

    <div class="setting-card mobile-only" style="margin-bottom: 1rem; border-color: rgba(255, 170, 0, 0.3); background: rgba(255, 170, 0, 0.05);">
      <div class="setting-info">
        <h3 style="color: #ffaa00;">Session</h3>
        <p>End your current session securely.</p>
      </div>
      <div class="setting-control">
        <button class="ghost-btn" style="color: #ffaa00; border-color: #ffaa00;" on:click={() => dispatch('requestConfirm', {
          title: "Sign Out", 
          message: "End the current session?", 
          actionText: "SIGN OUT", 
          onConfirm: logout
        })}>Sign Out</button>
      </div>
    </div>

    <div class="setting-card" style="border-color: rgba(255, 68, 68, 0.3); background: rgba(255, 68, 68, 0.05);">
      <div class="setting-info">
        <h3 style="color: #ff4444;">Danger Zone</h3>
        <p>Permanently delete your account and all tracker data.</p>
      </div>
      <div class="setting-control">
        <button class="action-btn danger-bg" on:click={() => dispatch('requestConfirm', {
          title: "Delete Account", 
          message: "This action is irreversible. Are you sure?", 
          actionText: "DELETE ACCOUNT", 
          onConfirm: logout
        })}>Delete Account</button>
      </div>
    </div>

  </div>
</main>

