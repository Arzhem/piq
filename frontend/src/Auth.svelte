<script>
  import { fade, slide } from 'svelte/transition';
  import { token, toast } from './store.js';
  import { validatePassword } from './utils.js';
  import piq_logo from './assets/piq-logo.png';

  const API_BASE = '/api';

  let authMode = 'login';
  let authUsername = '';
  let authPassword = '';
  let authConfirmPassword = '';
  let authError = '';

  let toastTimeout;

  function showNotification(message, type = 'success', duration = 3000) {
    toast.set({ visible: true, message, type });
    clearTimeout(toastTimeout);
    if (duration > 0) {
      toastTimeout = setTimeout(() => toast.set({ visible: false, message: '', type: 'success' }), duration);
    }
  }

  async function handleAuth() {
    authError = '';

    if (authMode === 'register') {
      const pwdIssue = validatePassword(authPassword);
      if (pwdIssue) { authError = pwdIssue; return; }
      if (authPassword !== authConfirmPassword) { authError = "Passwords do not match."; return; }
    }

    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    try {
      const res = await fetch(`${API_BASE.replace('/api', '')}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      if (authMode === 'register') {
        authMode = 'login';
        authPassword = '';
        authConfirmPassword = '';
        showNotification('Account created. Please log in.', 'success');
      } else {
        $token = data.token;
        authUsername = '';
        authPassword = '';
      }
    } catch (err) { 
      authError = err.message; 
    }
  }
</script>

<div class="auth-container">
  <div class="auth-card" in:fade>
    <img src={piq_logo} alt="piq" class="auth-logo" />
    <h2 style="text-align: center; margin-bottom: 2rem;">{authMode === 'login' ? 'Sign In' : 'Create Workspace'}</h2>
    {#if authError}<div class="auth-error" in:slide>{authError}</div>{/if}

    <input type="text" bind:value={authUsername} placeholder="Username" />
    <input type="password" bind:value={authPassword} placeholder="Password" on:keydown={e => e.key === 'Enter' && authMode === 'login' && handleAuth()} />

    {#if authMode === 'register'}
      <input type="password" bind:value={authConfirmPassword} placeholder="Confirm Password" on:keydown={e => e.key === 'Enter' && handleAuth()} style="margin-top: 0.5rem;" />
      <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.5rem; text-align: left;">
        * Minimum 8 characters, 1 uppercase, 1 number.
      </p>
    {/if}

    <button class="action-btn" on:click={handleAuth} style="margin-top: 1.5rem;">{authMode === 'login' ? 'Continue' : 'Create Account'}</button>
    <button class="ghost-btn" on:click={() => { authMode = authMode === 'login' ? 'register' : 'login'; authError = ''; }} style="width: 100%; border: none; margin-top: 0.5rem;">
      {authMode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
    </button>
  </div>
</div>
