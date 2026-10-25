(function () {
  'use strict';

  // Доступні швидкості
  const SPEEDS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
  let currentSpeed = 1;
  let menuOpen = false;

  // ─── Знайти активне відео ───────────────────────────────────────────────────
  function getActiveVideo() {
    // Шукаємо відео, яке зараз грає, або перше visible-відео
    const videos = Array.from(document.querySelectorAll('video'));
    return (
      videos.find(v => !v.paused && !v.ended) ||
      videos.find(v => {
        const r = v.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      }) ||
      videos[0] ||
      null
    );
  }

  // ─── Застосувати швидкість до всіх відео ───────────────────────────────────
  function applySpeedToAll() {
    document.querySelectorAll('video').forEach(v => {
      v.playbackRate = currentSpeed;
    });
  }

  // ─── Встановити швидкість ───────────────────────────────────────────────────
  function setSpeed(speed, showToast = true) {
    currentSpeed = speed;
    applySpeedToAll();
    updateUI();
    if (showToast) showSpeedToast(speed);
  }

  // ─── Крок швидкості (Shift+. / Shift+,) ────────────────────────────────────
  function stepSpeed(direction) {
    // Шукаємо найближчий індекс
    let idx = SPEEDS.findIndex(s => Math.abs(s - currentSpeed) < 0.01);
    if (idx === -1) idx = SPEEDS.indexOf(1);
    const newIdx = Math.max(0, Math.min(SPEEDS.length - 1, idx + direction));
    if (newIdx !== idx) setSpeed(SPEEDS[newIdx]);
  }

  // ─── Toast ─────────────────────────────────────────────────────────────────
  function showSpeedToast(speed) {
    showToast(speed + '×');
  }

  function showToast(text, duration = 700, fontSize = '28px') {
    let toast = document.getElementById('ig-sr-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ig-sr-toast';
      Object.assign(toast.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(0,0,0,0.82)',
        color: '#fff',
        fontSize: '28px',
        fontWeight: '700',
        padding: '14px 28px',
        borderRadius: '14px',
        zIndex: '2147483647',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 0.15s ease',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        letterSpacing: '-0.5px',
      });
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.fontSize = fontSize;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, duration);
  }

  // ─── Завантаження рілса ─────────────────────────────────────────────────────
  // Instagram віддає відео через blob: (MediaSource), тому прямий src не підходить.
  // Беремо shortcode рілса → media id → API Instagram → посилання на mp4.
  const IG_APP_ID = '936619743392459';
  const SHORTCODE_RE = /\/(?:reels?|p)\/([A-Za-z0-9_-]{5,})/;
  let downloading = false;

  function parseShortcode(href) {
    const m = href && href.match(SHORTCODE_RE);
    return m && m[1] !== 'audio' ? m[1] : null;
  }

  function getShortcodeForVideo(video) {
    // На /reel/…, /reels/…, /p/… URL вказує на поточне відео
    const fromUrl = parseShortcode(location.pathname);
    if (fromUrl) return fromUrl;

    // У стрічці — шукаємо посилання на пост у найближчому контейнері з одним відео
    for (let el = video && video.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.querySelectorAll('video').length > 1) break;
      for (const a of el.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
        const code = parseShortcode(a.getAttribute('href'));
        if (code) return code;
      }
    }
    return null;
  }

  function shortcodeToMediaId(code) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = 0n;
    for (const ch of code.slice(0, 11)) id = id * 64n + BigInt(alphabet.indexOf(ch));
    return id.toString();
  }

  async function fetchVideoInfo(code, video) {
    const res = await fetch(`/api/v1/media/${shortcodeToMediaId(code)}/info/`, {
      credentials: 'include',
      headers: { 'X-IG-App-ID': IG_APP_ID },
    });
    if (!res.ok) throw new Error('API ' + res.status);
    const item = (await res.json()).items?.[0];
    if (!item) throw new Error('Пост не знайдено');

    // Карусель: беремо відео, тривалість якого найближча до активного
    let media = item;
    if (item.carousel_media) {
      const vids = item.carousel_media.filter(m => m.video_versions?.length);
      const dur = video && isFinite(video.duration) ? video.duration : 0;
      media = vids.sort((a, b) =>
        Math.abs((a.video_duration || 0) - dur) - Math.abs((b.video_duration || 0) - dur)
      )[0];
    }
    const versions = media && media.video_versions;
    if (!versions || !versions.length) throw new Error('У пості немає відео');

    const best = versions.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    return { url: best.url, username: item.user?.username || 'instagram' };
  }

  async function downloadActiveReel() {
    if (downloading) return;
    const video = getActiveVideo();
    if (!video) { showToast('Відео не знайдено', 1500, '18px'); return; }

    downloading = true;
    setDownloadBtnBusy(true);
    try {
      let url, filename;
      const code = getShortcodeForVideo(video);
      if (code) {
        const info = await fetchVideoInfo(code, video);
        url = info.url;
        filename = `instagram_${info.username}_${code}.mp4`;
      } else if (video.src && !video.src.startsWith('blob:')) {
        url = video.src;
        filename = `instagram_${Date.now()}.mp4`;
      } else {
        throw new Error('Не вдалося визначити рілс');
      }

      filename = filename.replace(/[^\w.-]/g, '_');
      const res = await chrome.runtime.sendMessage({ type: 'igsr-download', url, filename });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Помилка завантаження');
      showToast('⬇ Завантаження…', 1200, '18px');
    } catch (err) {
      console.warn('[Reels Speed] download failed:', err);
      showToast('Не вдалося завантажити: ' + err.message, 2500, '16px');
    } finally {
      downloading = false;
      setDownloadBtnBusy(false);
    }
  }

  function setDownloadBtnBusy(busy) {
    const btn = document.getElementById('ig-sr-download');
    if (!btn) return;
    btn.textContent = busy ? '…' : '⬇';
    btn.style.cursor = busy ? 'wait' : 'pointer';
  }

  // ─── Оновити стан кнопок ────────────────────────────────────────────────────
  function updateUI() {
    const panel = document.getElementById('ig-sr-panel');
    if (!panel) return;

    const indicator = panel.querySelector('#ig-sr-indicator');
    if (indicator) indicator.textContent = formatSpeed(currentSpeed);

    panel.querySelectorAll('[data-igsr-speed]').forEach(btn => {
      const s = parseFloat(btn.dataset.igspeed);
      btn.style.background = Math.abs(s - currentSpeed) < 0.01
        ? 'rgba(255,255,255,0.30)'
        : 'rgba(255,255,255,0.08)';
      btn.style.fontWeight = Math.abs(s - currentSpeed) < 0.01 ? '700' : '400';
    });
  }

  function formatSpeed(s) {
    return (Number.isInteger(s) ? s : s.toFixed(1)) + '×';
  }

  // ─── Створити панель ────────────────────────────────────────────────────────
  function createPanel() {
    if (document.getElementById('ig-sr-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'ig-sr-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '90px',
      right: '18px',
      zIndex: '2147483646',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      userSelect: 'none',
    });

    // Кнопка-індикатор
    const indicator = document.createElement('div');
    indicator.id = 'ig-sr-indicator';
    Object.assign(indicator.style, {
      background: 'rgba(0,0,0,0.78)',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '600',
      padding: '6px 11px',
      borderRadius: '20px',
      cursor: 'pointer',
      textAlign: 'center',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      transition: 'background 0.15s',
      letterSpacing: '-0.2px',
    });
    indicator.textContent = formatSpeed(currentSpeed);
    indicator.title = 'Швидкість відео (Shift+. / Shift+,)';

    // Меню зі швидкостями
    const menu = document.createElement('div');
    menu.id = 'ig-sr-menu';
    Object.assign(menu.style, {
      display: 'none',
      flexDirection: 'column',
      gap: '3px',
      background: 'rgba(0,0,0,0.88)',
      borderRadius: '12px',
      padding: '7px',
      marginBottom: '8px',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      minWidth: '72px',
    });

    // Додаємо кнопки швидкостей у зворотньому порядку (5× зверху)
    [...SPEEDS].reverse().forEach(speed => {
      const btn = document.createElement('button');
      btn.dataset.igspeed = speed;
      btn.setAttribute('data-igsr-speed', speed);
      btn.textContent = formatSpeed(speed);
      Object.assign(btn.style, {
        background: Math.abs(speed - currentSpeed) < 0.01
          ? 'rgba(255,255,255,0.30)'
          : 'rgba(255,255,255,0.08)',
        color: '#fff',
        border: 'none',
        borderRadius: '7px',
        padding: '6px 10px',
        fontSize: '13px',
        fontWeight: Math.abs(speed - currentSpeed) < 0.01 ? '700' : '400',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'background 0.12s',
        fontFamily: 'inherit',
        width: '100%',
      });
      btn.addEventListener('mouseenter', () => {
        if (Math.abs(parseFloat(btn.dataset.igspeed) - currentSpeed) >= 0.01)
          btn.style.background = 'rgba(255,255,255,0.18)';
      });
      btn.addEventListener('mouseleave', () => {
        if (Math.abs(parseFloat(btn.dataset.igspeed) - currentSpeed) >= 0.01)
          btn.style.background = 'rgba(255,255,255,0.08)';
      });
      btn.addEventListener('click', e => {
        e.stopPropagation();
        setSpeed(parseFloat(btn.dataset.igspeed));
        closeMenu();
      });
      menu.appendChild(btn);
    });

    // Відкрити/закрити меню по кліку на індикатор
    indicator.addEventListener('click', e => {
      e.stopPropagation();
      menuOpen ? closeMenu() : openMenu();
    });

    // Кнопка завантаження
    const downloadBtn = document.createElement('div');
    downloadBtn.id = 'ig-sr-download';
    Object.assign(downloadBtn.style, {
      background: 'rgba(0,0,0,0.78)',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '600',
      padding: '6px 11px',
      borderRadius: '20px',
      cursor: 'pointer',
      textAlign: 'center',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      transition: 'background 0.15s',
    });
    downloadBtn.textContent = '⬇';
    downloadBtn.title = 'Завантажити рілс (Shift+D)';
    downloadBtn.addEventListener('click', e => {
      e.stopPropagation();
      closeMenu();
      downloadActiveReel();
    });

    // Рядок: [⬇] [1×]
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '6px', justifyContent: 'flex-end' });
    row.appendChild(downloadBtn);
    row.appendChild(indicator);

    panel.appendChild(menu);
    panel.appendChild(row);
    document.body.appendChild(panel);

    // Закрити при кліку поза панеллю
    document.addEventListener('click', e => {
      if (!panel.contains(e.target)) closeMenu();
    });
  }

  function openMenu() {
    const menu = document.getElementById('ig-sr-menu');
    if (menu) { menu.style.display = 'flex'; menuOpen = true; }
  }

  function closeMenu() {
    const menu = document.getElementById('ig-sr-menu');
    if (menu) { menu.style.display = 'none'; menuOpen = false; }
  }

  // ─── MutationObserver: слідкуємо за новими відео ───────────────────────────
  const videoObserver = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const vids = node.tagName === 'VIDEO' ? [node] : node.querySelectorAll('video');
        vids.forEach(v => attachVideoHandlers(v));
      });
    });
  });

  function attachVideoHandlers(video) {
    if (video._igSrAttached) return;
    video._igSrAttached = true;

    // Застосувати швидкість одразу
    video.playbackRate = currentSpeed;

    // Коли відео починає грати — виставити швидкість
    video.addEventListener('play', () => { video.playbackRate = currentSpeed; });

    // Блокуємо Instagram від скидання швидкості
    video.addEventListener('ratechange', () => {
      if (video._settingRate) return;
      if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
        video._settingRate = true;
        video.playbackRate = currentSpeed;
        video._settingRate = false;
      }
    });
  }

  // ─── Клавіатурні скорочення ─────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Ігноруємо якщо курсор у текстовому полі
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (document.activeElement && document.activeElement.isContentEditable) return;

    // Shift+. → швидше   |   Shift+, → повільніше
    if (e.shiftKey && (e.key === '>' || e.code === 'Period')) {
      e.preventDefault();
      stepSpeed(+1);
    } else if (e.shiftKey && (e.key === '<' || e.code === 'Comma')) {
      e.preventDefault();
      stepSpeed(-1);
    } else if (e.shiftKey && e.code === 'KeyD') {
      e.preventDefault();
      downloadActiveReel();
    }
  });

  // ─── Перемотка стрілками ←/→ ───────────────────────────────────────────────
  // Capture-фаза на window, щоб спрацювати раніше за обробники Instagram
  // (у каруселях стрілки інакше перемикають слайди)
  const SEEK_STEP = 5; // секунд

  window.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (document.activeElement && document.activeElement.isContentEditable) return;

    const video = getActiveVideo();
    if (!video || !isFinite(video.duration)) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const delta = e.key === 'ArrowRight' ? SEEK_STEP : -SEEK_STEP;
    video.currentTime = Math.max(0, Math.min(video.duration - 0.1, video.currentTime + delta));
    showToast((delta > 0 ? '+' : '−') + SEEK_STEP + ' с', 600, '22px');
  }, true);

  // ─── Ініціалізація ─────────────────────────────────────────────────────────
  function init() {
    createPanel();

    // Підключаємо обробники до вже існуючих відео
    document.querySelectorAll('video').forEach(v => attachVideoHandlers(v));

    // Спостерігаємо за DOM
    videoObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Реагуємо на SPA-навігацію Instagram ───────────────────────────────────
  let _lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      // Панель вже є, просто переприкладаємо швидкість
      setTimeout(applySpeedToAll, 400);
      setTimeout(applySpeedToAll, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

  // Запуск
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
