/**
 * Auth Modal - Login / Register UI
 *
 * Uses the same overlay/modal pattern as the onboarding modal for visual consistency.
 */

import { el } from '../helpers';
import { login, register, getUser, type AuthUser } from './auth-state';

type AuthModalMode = 'login' | 'register';

/**
 * Show the auth modal. Returns a promise that resolves with the user
 * if authentication succeeds, or null if the modal is dismissed.
 */
export function showAuthModal(initialMode: AuthModalMode = 'login'): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    let mode = initialMode;
    let loading = false;

    // ── Overlay ──────────────────────────────────────────────────
    const overlay = el('div', { className: 'auth-overlay' });

    // ── Modal container ──────────────────────────────────────────
    const modal = el('div', { className: 'auth-modal' });

    // ── Title ────────────────────────────────────────────────────
    const titleEl = el('h2', { className: 'auth-title' });

    // ── Error display ────────────────────────────────────────────
    const errorEl = el('div', { className: 'auth-error' });
    errorEl.style.display = 'none';

    // ── Form fields ──────────────────────────────────────────────
    const nameLabel = el('label', { className: 'auth-label', text: 'Display Name' });
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'auth-input';
    nameInput.placeholder = 'Your name';
    nameInput.autocomplete = 'name';
    const nameGroup = el('div', { className: 'auth-field', children: [nameLabel, nameInput] });

    const emailLabel = el('label', { className: 'auth-label', text: 'Email' });
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.className = 'auth-input';
    emailInput.placeholder = 'you@example.com';
    emailInput.autocomplete = 'email';
    const emailGroup = el('div', { className: 'auth-field', children: [emailLabel, emailInput] });

    const passwordLabel = el('label', { className: 'auth-label', text: 'Password' });
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.className = 'auth-input';
    passwordInput.placeholder = 'At least 8 characters';
    passwordInput.autocomplete = 'current-password';
    const passwordGroup = el('div', { className: 'auth-field', children: [passwordLabel, passwordInput] });

    // ── Submit button ────────────────────────────────────────────
    const submitBtn = el('button', { className: 'btn btn-primary auth-submit' });

    // ── Mode toggle link ─────────────────────────────────────────
    const toggleText = el('span', { className: 'auth-toggle-text' });
    const toggleLink = el('button', { className: 'auth-toggle-link' });
    const toggleRow = el('div', { className: 'auth-toggle', children: [toggleText, ' ', toggleLink] });

    // ── OAuth buttons ─────────────────────────────────────────────
    // GitHub SVG icon
    const ghSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ghSvg.setAttribute('viewBox', '0 0 16 16');
    ghSvg.setAttribute('width', '16');
    ghSvg.setAttribute('height', '16');
    ghSvg.setAttribute('fill', 'currentColor');
    ghSvg.innerHTML = '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>';

    const githubBtn = el('button', {
      className: 'btn auth-oauth-btn auth-github-btn',
      onClick: () => { window.location.href = '/api/auth/github'; },
    });
    githubBtn.appendChild(ghSvg);
    githubBtn.appendChild(document.createTextNode(' Continue with GitHub'));

    // Google SVG icon
    const gSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    gSvg.setAttribute('viewBox', '0 0 48 48');
    gSvg.setAttribute('width', '16');
    gSvg.setAttribute('height', '16');
    gSvg.innerHTML = '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>';

    const googleBtn = el('button', {
      className: 'btn auth-oauth-btn auth-google-btn',
      onClick: () => { window.location.href = '/api/auth/google'; },
    });
    googleBtn.appendChild(gSvg);
    googleBtn.appendChild(document.createTextNode(' Continue with Google'));

    const oauthSection = el('div', { className: 'auth-oauth-section', children: [
      githubBtn,
      googleBtn,
    ]});

    const dividerRow = el('div', { className: 'auth-divider', children: [
      el('span', { className: 'auth-divider-line' }),
      el('span', { className: 'auth-divider-text', text: 'or' }),
      el('span', { className: 'auth-divider-line' }),
    ]});

    // ── Form ─────────────────────────────────────────────────────
    const form = el('div', { className: 'auth-form', children: [
      oauthSection,
      dividerRow,
      nameGroup,
      emailGroup,
      passwordGroup,
      submitBtn,
      toggleRow,
    ] });

    modal.appendChild(titleEl);
    modal.appendChild(errorEl);
    modal.appendChild(form);
    overlay.appendChild(modal);

    function showError(msg: string) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }

    function clearError() {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }

    function setLoading(l: boolean) {
      loading = l;
      submitBtn.textContent = l
        ? (mode === 'login' ? 'Signing in\u2026' : 'Creating account\u2026')
        : (mode === 'login' ? 'Sign In' : 'Create Account');
      submitBtn.classList.toggle('loading', l);
      emailInput.disabled = l;
      passwordInput.disabled = l;
      nameInput.disabled = l;
    }

    function renderMode() {
      clearError();
      titleEl.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
      nameGroup.style.display = mode === 'register' ? '' : 'none';
      submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
      toggleText.textContent = mode === 'login' ? "Don't have an account? " : 'Already have an account? ';
      toggleLink.textContent = mode === 'login' ? 'Create one' : 'Sign in';
      passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';

      // Focus first visible input
      setTimeout(() => {
        if (mode === 'register') nameInput.focus();
        else emailInput.focus();
      }, 50);
    }

    function close(user: AuthUser | null = null) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKeydown);
      resolve(user);
    }

    async function handleSubmit() {
      if (loading) return;
      clearError();

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const displayName = nameInput.value.trim();

      // Validation
      if (!email) { showError('Email is required'); emailInput.focus(); return; }
      if (!password) { showError('Password is required'); passwordInput.focus(); return; }
      if (password.length < 8) { showError('Password must be at least 8 characters'); passwordInput.focus(); return; }
      if (mode === 'register' && !displayName) { showError('Display name is required'); nameInput.focus(); return; }

      setLoading(true);

      try {
        const result = mode === 'login'
          ? await login(email, password)
          : await register(email, password, displayName);

        if (!result.ok) {
          showError(result.error || 'Something went wrong');
          setLoading(false);
          return;
        }

        // Success — close modal
        // Auth state is already updated by login/register
        close(getUser());
      } catch (err) {
        showError('Network error — please try again');
        setLoading(false);
      }
    }

    // ── Event listeners ──────────────────────────────────────────
    submitBtn.addEventListener('click', handleSubmit);

    toggleLink.addEventListener('click', () => {
      mode = mode === 'login' ? 'register' : 'login';
      renderMode();
    });

    // Submit on Enter in password field
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (mode === 'register') emailInput.focus();
      }
    });

    // Close on overlay click (not modal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') close(null);
    }
    document.addEventListener('keydown', onKeydown);

    // ── Mount & animate ──────────────────────────────────────────
    document.body.appendChild(overlay);
    overlay.offsetHeight; // Force reflow
    overlay.classList.add('visible');

    renderMode();
  });
}
