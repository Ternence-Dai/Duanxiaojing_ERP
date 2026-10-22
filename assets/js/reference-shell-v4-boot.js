/* Reference shell v4: promote the validated operations cockpit to the default ERP dashboard. */
(function () {
  'use strict';
  function mount() {
    const target = document.getElementById('content');
    if (!target || typeof window.renderOperationsCockpit !== 'function') return false;
    const html = window.renderOperationsCockpit();
    if (!html) return false;
    target.innerHTML = html;
    target.dataset.referenceMounted = 'v4';
    return true;
  }
  function scheduleMount() {
    window.setTimeout(mount, 0);
    window.setTimeout(mount, 180);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  } else scheduleMount();
  window.addEventListener('load', scheduleMount, { once: true });
  document.addEventListener('click', event => {
    const nav = event.target.closest('#navGroup .nav-item');
    if (!nav) return;
    const key = nav.dataset.page || '';
    if (/dashboard|home/i.test(key)) scheduleMount();
  });
})();