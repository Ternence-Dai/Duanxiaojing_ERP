/* Workspace V5 navigation utility — resilient command launcher */
(function () {
  "use strict";
  const theme = document.body && document.body.dataset.workspace;
  if (!theme) return;

  const selectors = {
    fuelcell: '#sideNav .nav-item[data-action="nav"], #sideNav [data-page], #sideNav button',
    health: '#navList .nav-item[data-nav], #navList [data-page], #navList button',
    erp: '#navGroup .nav-item[data-page], #navGroup [data-page], #sidebar [data-page]',
    study: '#tabbar button[data-tab], .tabbar button[data-tab]',
    ekpo: '#mobileNav [data-tab], .nav-item[data-tab], [data-tab="gases"], [data-tab="maintenance"], [data-tab="spareParts"], [data-tab="testDiary"]',
    physchem: null
  };

  function init() {
    if (document.querySelector('.w5-command-trigger')) return;
    const host = document.querySelector('.topbar-right, .topbar-actions, .ac, .topbar, .tb, .navbar');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'w5-command-trigger';
    trigger.setAttribute('aria-haspopup', theme === 'physchem' ? 'search' : 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = theme === 'physchem' ? '⌕ 实验检索  Ctrl K' : '⌘ 快速跳转';
    if (host) {
      host.appendChild(trigger);
    } else {
      trigger.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9998;padding:11px 15px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:#172b4d;color:#fff;box-shadow:0 8px 28px rgba(15,35,65,.25);font:700 12px/1.2 system-ui;cursor:pointer';
      document.body.appendChild(trigger);
    }

    if (theme === 'physchem') {
      const focusSearch = () => {
        const search = document.getElementById('search');
        if (search) {
          search.focus();
          search.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      };
      trigger.addEventListener('click', focusSearch);
      document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          focusSearch();
        }
      });
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'w5-command-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML =
      '<section id="w5-command-dialog" class="w5-command-panel" role="dialog" aria-modal="true" aria-labelledby="w5-command-title">' +
        '<div class="w5-command-heading"><div><small>WORKSPACE COMMAND</small><strong id="w5-command-title">快速打开模块</strong></div>' +
        '<button class="w5-command-close" type="button" aria-label="关闭">Esc</button></div>' +
        '<input id="w5-command-input" class="w5-command-input" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="w5-command-list" autocomplete="off" placeholder="输入模块名称进行筛选…" aria-label="筛选模块">' +
        '<div id="w5-command-list" class="w5-command-list" role="listbox" aria-label="可打开的模块"></div>' +
        '<div class="w5-command-hint">↑ ↓ 选择 · Enter 打开 · Esc 关闭 · Ctrl/⌘ K 呼出</div>' +
      '</section>';
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector('.w5-command-input');
    const list = backdrop.querySelector('.w5-command-list');
    const closeButton = backdrop.querySelector('.w5-command-close');
    let activeIndex = 0;
    let visibleItems = [];

    function collect() {
      const selector = selectors[theme];
      if (!selector) return [];
      const seen = new Set();
      return Array.from(document.querySelectorAll(selector)).map(node => ({
        node,
        label: (node.getAttribute('aria-label') || node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim()
      })).filter(item => {
        const key = item.label.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function render() {
      const query = input.value.trim().toLowerCase();
      visibleItems = collect().filter(item => item.label.toLowerCase().includes(query)).slice(0, 12);
      activeIndex = Math.min(activeIndex, Math.max(0, visibleItems.length - 1));
      list.replaceChildren();
      if (!visibleItems.length) {
        const empty = document.createElement('div');
        empty.className = 'w5-command-empty';
        empty.textContent = '暂未找到可跳转模块，请使用页面原有导航。';
        list.appendChild(empty);
        input.removeAttribute('aria-activedescendant');
        return;
      }
      visibleItems.forEach((item, index) => {
        const button = document.createElement('div');
        button.className = 'w5-command-entry' + (index === activeIndex ? ' active' : '');
        button.id = 'w5-command-option-' + index;
        button.tabIndex = -1;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
        const title = document.createElement('span');
        title.textContent = item.label;
        const hint = document.createElement('small');
        hint.textContent = '打开模块';
        button.append(title, hint);
        button.addEventListener('mouseenter', () => {
          activeIndex = index;
          syncActiveOption();
        });
        button.addEventListener('click', () => { item.node.click(); close(); });
        list.appendChild(button);
      });
      syncActiveOption();
    }
    function syncActiveOption() {
      const options = Array.from(list.querySelectorAll('[role="option"]'));
      options.forEach((option, index) => {
        option.classList.toggle('active', index === activeIndex);
        option.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
      });
      const active = options[activeIndex];
      if (active) input.setAttribute('aria-activedescendant', active.id);
      else input.removeAttribute('aria-activedescendant');
    }
    function open() {
      backdrop.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-expanded', 'true');
      input.value = '';
      activeIndex = 0;
      render();
      input.focus();
    }
    function close() {
      backdrop.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      trigger.focus();
    }
    trigger.setAttribute('aria-controls', 'w5-command-dialog');
    trigger.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    input.addEventListener('input', () => { activeIndex = 0; render(); });
    backdrop.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || backdrop.hidden) return;
      const focusable = Array.from(backdrop.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); input.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !backdrop.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !backdrop.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && visibleItems.length) {
        event.preventDefault(); activeIndex = (activeIndex + 1) % visibleItems.length; render();
      } else if (event.key === 'ArrowUp' && visibleItems.length) {
        event.preventDefault(); activeIndex = (activeIndex - 1 + visibleItems.length) % visibleItems.length; render();
      } else if (event.key === 'Enter' && visibleItems[activeIndex]) {
        event.preventDefault(); visibleItems[activeIndex].node.click(); close();
      }
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); backdrop.hidden ? open() : close();
      } else if (event.key === 'Escape' && !backdrop.hidden) close();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();