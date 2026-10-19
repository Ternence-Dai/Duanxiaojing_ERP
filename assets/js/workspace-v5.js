/* Workspace V5 navigation utility — keyboard-accessible module launcher */
(function () {
  "use strict";
  const theme = document.body && document.body.dataset.workspace;
  if (!theme) return;

  const selectors = {
    fuelcell: '#sideNav .nav-item[data-action="nav"]',
    health: '#navList .nav-item[data-nav]',
    erp: '#navGroup .nav-item[data-page]',
    study: '#tabbar button[data-tab]',
    ekpo: '#mobileNav [data-tab]',
    physchem: null
  };

  function init() {
    const host = document.querySelector('.topbar-right') ||
      document.querySelector('.topbar-actions') ||
      document.querySelector('.ac') ||
      document.querySelector('.topbar') ||
      document.querySelector('.tb') ||
      document.querySelector('.navbar');
    if (!host || document.querySelector('.w5-command-trigger')) return;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'w5-command-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = theme === 'physchem' ? '⌕ 实验检索  Ctrl K' : '⌘ 快速跳转';
    host.appendChild(trigger);

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
      '<section class="w5-command-panel" role="dialog" aria-modal="true" aria-label="快速跳转">' +
        '<div class="w5-command-heading"><div><small>WORKSPACE COMMAND</small><strong>快速打开模块</strong></div>' +
        '<button class="w5-command-close" type="button" aria-label="关闭">Esc</button></div>' +
        '<input class="w5-command-input" type="search" autocomplete="off" placeholder="输入模块名称进行筛选…" aria-label="筛选模块">' +
        '<div class="w5-command-list" role="listbox"></div>' +
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
      return Array.from(document.querySelectorAll(selector)).map(node => {
        const label = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
        return { node, label };
      }).filter(item => {
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
        empty.textContent = '没有匹配的模块，请更换关键词。';
        list.appendChild(empty);
        return;
      }
      visibleItems.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'w5-command-entry' + (index === activeIndex ? ' active' : '');
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
        const title = document.createElement('span');
        title.textContent = item.label;
        const hint = document.createElement('small');
        hint.textContent = '打开模块';
        button.append(title, hint);
        button.addEventListener('mouseenter', () => {
          activeIndex = index;
          Array.from(list.children).forEach((el, i) => el.classList.toggle('active', i === activeIndex));
        });
        button.addEventListener('click', () => {
          item.node.click();
          close();
        });
        list.appendChild(button);
      });
    }

    function open() {
      backdrop.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      input.value = '';
      activeIndex = 0;
      render();
      input.focus();
    }

    function close() {
      backdrop.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }

    trigger.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) close();
    });
    input.addEventListener('input', () => { activeIndex = 0; render(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && visibleItems.length) {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % visibleItems.length;
        render();
      } else if (event.key === 'ArrowUp' && visibleItems.length) {
        event.preventDefault();
        activeIndex = (activeIndex - 1 + visibleItems.length) % visibleItems.length;
        render();
      } else if (event.key === 'Enter' && visibleItems[activeIndex]) {
        event.preventDefault();
        visibleItems[activeIndex].node.click();
        close();
      }
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        backdrop.hidden ? open() : close();
      } else if (event.key === 'Escape' && !backdrop.hidden) {
        close();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();