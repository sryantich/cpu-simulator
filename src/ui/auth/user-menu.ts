/**
 * User Menu - Header component for auth state
 *
 * Shows "Sign In" button when logged out, user avatar + dropdown when logged in.
 */

import { el } from '../helpers';
import { tooltip } from '../tooltip';
import { getUser, isLoggedIn, onAuthChange, logout, type AuthUser } from './auth-state';
import { showAuthModal } from './auth-modal';

/**
 * Creates the user menu element and returns it.
 * The element auto-updates when auth state changes.
 */
export function createUserMenu(): HTMLElement {
  const container = el('div', { className: 'user-menu' });

  function render() {
    container.innerHTML = '';

    if (!isLoggedIn()) {
      // ── Signed out: show "Sign In" button ──────────────────
      const signInBtn = el('button', {
        className: 'btn btn-primary user-sign-in-btn',
        text: 'Sign In',
        onClick: () => { showAuthModal('login'); },
      });
      tooltip(signInBtn, 'Sign in to sync your progress across devices');
      container.appendChild(signInBtn);
    } else {
      // ── Signed in: show avatar + dropdown ──────────────────
      const user = getUser()!;
      const initial = (user.displayName || user.email)[0].toUpperCase();

      const avatar = el('button', {
        className: 'user-avatar-btn',
        text: initial,
      });
      tooltip(avatar, () => `Signed in as ${user.displayName}`);

      // Dropdown
      const dropdown = el('div', { className: 'user-dropdown', children: [
        el('div', { className: 'user-dropdown-header', children: [
          el('div', { className: 'user-dropdown-name', text: user.displayName }),
          el('div', { className: 'user-dropdown-email', text: user.email }),
        ]}),
        el('div', { className: 'user-dropdown-divider' }),
        el('button', {
          className: 'user-dropdown-item',
          text: 'Sign Out',
          onClick: () => {
            dropdown.classList.remove('visible');
            logout();
          },
        }),
      ]});

      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('visible');
      });

      // Close dropdown when clicking elsewhere
      const closeDropdown = (e: MouseEvent) => {
        if (!container.contains(e.target as Node)) {
          dropdown.classList.remove('visible');
        }
      };
      document.addEventListener('click', closeDropdown);

      container.appendChild(avatar);
      container.appendChild(dropdown);
    }
  }

  // Initial render + listen for changes
  render();
  onAuthChange(() => render());

  return container;
}
