/**
 * XP Notification — shared floating notification for XP gains, level-ups, badges
 */

import { el } from './helpers.ts';
import type { XPEvent } from '../learning/progress.ts';

/** Show a floating XP notification that auto-dismisses */
export function showXPNotification(event: XPEvent): void {
  const notif = el('div', { className: 'xp-notification' });
  const parts: HTMLElement[] = [
    el('span', { className: 'xp-amount', text: `+${event.amount} XP` }),
  ];
  if (event.levelUp) {
    parts.push(el('span', {
      className: 'xp-levelup',
      text: `Level ${event.newLevel}!`,
    }));
  }
  for (const badge of event.newBadges) {
    parts.push(el('span', {
      className: 'xp-badge-earned',
      text: `${badge.icon} ${badge.name}`,
    }));
  }
  for (const p of parts) notif.appendChild(p);
  document.body.appendChild(notif);
  requestAnimationFrame(() => notif.classList.add('visible'));
  setTimeout(() => {
    notif.classList.remove('visible');
    setTimeout(() => notif.remove(), 400);
  }, 2500);
}
