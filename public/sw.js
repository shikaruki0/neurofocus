/**
 * NeuroFocus Service Worker — Background timer support & notifications
 */
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'NOTIFY') {
    self.registration.showNotification('NeuroFocus — Timer Complete', {
      body: e.data.body || 'Your focus session finished!',
      icon: '/favicon.svg',
      tag: 'neurofocus-timer',
    });
  }
});
