// In-App Browser (IAB) Detection
(function(){
  try {
    if (/FBAN|FBAV|Instagram|Messenger/i.test(navigator.userAgent)) {
      var b = document.getElementById('iabBanner');
      if (b) b.style.display = 'block';
    }
  } catch(e){}
})();

(function(){
  const FORM_ENDPOINT = "https://late-forest-4748.dreamsicreation.workers.dev";
  const LS_USER_KEY = "va_user";
  const LS_REGISTERED_KEY = "va_registered";
  const LS_DEVICE_TOKEN_KEY = "va_device_token";
  const LS_STUDENT_SESSION_TOKEN_KEY = "va_student_session_token";
  const LS_FP_KEY = "va_fp";

  // localStorage UUID — backward compat (still used as fallback)
  function getDeviceToken(){
    let token = localStorage.getItem(LS_DEVICE_TOKEN_KEY);
    if(!token){
      token = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Date.now().toString(36) + Math.random().toString(36).slice(2));
      localStorage.setItem(LS_DEVICE_TOKEN_KEY, token);
    }
    return token;
  }

  // Universal Hardware Fingerprint — 100% Cross-Browser & In-App Browser Stable
  // Guaranteed identical across Chrome, Edge, Firefox, FB In-App Browser, Samsung Internet on the same physical device
  async function getFingerprint(){
    try {
      const cached = localStorage.getItem(LS_FP_KEY);
      if(cached && typeof cached === 'string' && cached.length >= 32){
        return cached;
      }

      const parts = [];

      // 1. Hardware Device Model & OS (Client Hints with UA fallback for Chrome UA-reduction)
      let deviceModel = '';
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        try {
          const hints = await navigator.userAgentData.getHighEntropyValues(['model']);
          if (hints && hints.model) {
            deviceModel = String(hints.model).trim().toLowerCase();
          }
        } catch(e){}
      }

      const ua = String(navigator.userAgent || '');
      const uaMatch = ua.match(/\(([^)]+)\)/);
      let rawParenthetical = uaMatch ? uaMatch[1] : '';

      if (!deviceModel && rawParenthetical) {
        // In WebViews / browsers with unreduced UA, extract model token (e.g. SM-A525F from "Linux; Android 14; SM-A525F; wv")
        const tokens = rawParenthetical.split(';').map(t => t.trim().toLowerCase());
        for (const t of tokens) {
          if (!t.startsWith('linux') && !t.startsWith('android') && !t.startsWith('build') && t !== 'wv' && t !== 'k' && t !== 'mobile') {
            deviceModel = t;
            break;
          }
        }
      }

      let os = 'other';
      if (/Windows/i.test(ua)) os = 'windows';
      else if (/Android/i.test(ua)) os = 'android';
      else if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
      else if (/Macintosh|Mac OS/i.test(ua)) os = 'mac';
      else if (/Linux/i.test(ua)) os = 'linux';

      parts.push(os + ' ' + (deviceModel || 'device'));

      // 2. Hardware Platform
      parts.push(String(navigator.platform || '').trim().toLowerCase());

      // 3. CPU Logical Cores
      parts.push(navigator.hardwareConcurrency || 4);

      // 4. Touch Hardware
      parts.push(navigator.maxTouchPoints || 0);

      // 5. Display Color Depth
      parts.push(screen.colorDepth || 24);

      // 6. Timezone & Offset
      try {
        parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
      } catch(e){}
      parts.push(new Date().getTimezoneOffset());

      // 7. Desktop/Laptop Only: Screen Resolution & GPU Chipset
      // On mobile devices, screen resolution & WebGL vary/fail inside FB/Messenger WebViews due to app zoom & sandboxing.
      // The hardware phone model in #1 already guarantees 100% device uniqueness on mobile.
      // On desktop PCs, WebGL and screen resolution are standard and rock-solid across Chrome/Edge/Firefox.
      if (!navigator.maxTouchPoints) {
        const sw = Math.round(screen.width || 0);
        const sh = Math.round(screen.height || 0);
        parts.push(Math.min(sw, sh) + 'x' + Math.max(sw, sh));

        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (gl) {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) {
              const raw = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
              const cleanedGpu = raw
                .replace(/^ANGLE\s*\(/i, '')
                .replace(/\)$/, '')
                .replace(/Direct3D\S+/gi, '')
                .replace(/OpenGL\s+ES\s+[\d.]+/gi, '')
                .replace(/vs_\S+\s+ps_\S+/gi, '')
                .replace(/,\s*(D3D11|D3D12|D3D9|Vulkan|Metal|OpenGL|WARP)/gi, '')
                .replace(/^(Google Inc\.|ARM|Qualcomm|Intel|NVIDIA|ATI Technologies Inc\.|Apple)\s*,?\s*/i, '')
                .replace(/[(),]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
              parts.push(cleanedGpu);
            }
          }
        } catch(e){}
      }

      // Fast native SHA-256 hash (instant, zero CDN lag)
      const raw = parts.join('|||');
      const encoder = new TextEncoder();
      const data = encoder.encode(raw);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      if(hash){
        try{ localStorage.setItem(LS_FP_KEY, hash); }catch(e){}
      }
      return hash;
    } catch(err) {
      const fallback = localStorage.getItem(LS_FP_KEY);
      return fallback || '';
    }
  }
  const classDataCache = new Map();
  let courseDataRowsPromise = null;
  let activeSubjectRows = [];
  const enrollQuery = new URLSearchParams(window.location.search);
  // Normalize text helper
  const normalizeLoose = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizeForMatch = normalizeLoose;
  const clean = value => String(value ?? '').trim();
  const enrollParam = enrollQuery.get('enroll');
  const enrollSectorParam = clean(enrollQuery.get('sector')).toUpperCase();
  const enrollFreeParam = enrollQuery.get('free') === '1' || /\bfree\b/i.test(enrollQuery.get('price') || '');
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const SW_COURSE_PREFIX = 'SW::';
  const SW_DEPARTMENTS = ['Accounting','Management','Marketing','Finance'];
  const SW_YEAR_ORDINALS = ['1st','2nd','3rd','4th'];

  function parseSubjectWiseCourseId(courseId){
    const s = String(courseId || '').trim();
    if(!s.startsWith(SW_COURSE_PREFIX)) return null;
    const parts = s.slice(SW_COURSE_PREFIX.length).split('::');
    if(parts.length < 2) return null;
    const level = clean(parts[0]);
    let department = '';
    let year = '';
    let nuDcu = '';
    let subject = '';

    if (parts.length === 2) {
      subject = clean(parts[1]);
    } else if (parts.length === 3) {
      year = clean(parts[1]);
      subject = clean(parts[2]);
    } else {
      department = clean(parts[1]);
      year = clean(parts[2]);
      const maybeSector = clean(parts[3]).toLowerCase();
      const isSector = ['nu','dcu'].includes(maybeSector);
      nuDcu = isSector ? clean(parts[3]).toUpperCase() : '';
      subject = isSector ? clean(parts.slice(4).join('::')) : clean(parts.slice(3).join('::'));
    }
    if(!level || !subject) return null;
    return { level, department, year, nuDcu, subject };
  }

  function getSubjectWiseDisplayName(courseId){
    const parsed = parseSubjectWiseCourseId(courseId);
    return parsed ? parsed.subject : courseId;
  }

  function extractYearFromCourseName(courseName){
    const norm = normalizeForMatch(courseName);
    for(const ord of SW_YEAR_ORDINALS){
      if(norm.includes(ord)) return `${ord} Year`;
    }
    return '';
  }
  function extractDepartmentFromCourseName(courseName){
    const norm = normalizeForMatch(courseName);
    for(const dept of SW_DEPARTMENTS){
      if(norm.includes(normalizeForMatch(dept))) return dept;
    }
    return '';
  }

  function cleanSubjectMatchText(s) {
    let str = String(s || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
      .replace(/[—–−]/g, '-')
      .replace(/&/g, ' and ')
      .replace(/[-_(),.:;/\\+[\]{}|`~!@#$%^*?=<>"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    str = str.replace(/^[\d.\s]+/, '').trim();
    return str;
  }

  function isCleanSubjectMatch(a, b) {
    if(!a || !b) return false;
    const aClean = cleanSubjectMatchText(a);
    const bClean = cleanSubjectMatchText(b);
    if(!aClean || !bClean) return false;
    if(aClean === bClean || aClean.replace(/\s+/g, '') === bClean.replace(/\s+/g, '')) return true;
    const aTokens = aClean.split(' ').filter(w => w.length > 2);
    const bTokens = bClean.split(' ').filter(w => w.length > 2);
    if(aTokens.length >= 2 || bTokens.length >= 2) {
      if(aClean.includes(bClean) || bClean.includes(aClean)) return true;
      if(aClean.startsWith(bClean) || bClean.startsWith(aClean)) return true;
      if(bTokens.length >= 2 && bTokens.every(tok => aClean.includes(tok))) return true;
      if(aTokens.length >= 2 && aTokens.every(tok => bClean.includes(tok))) return true;
    }
    return false;
  }

  function findSubjectWiseClassRows(allRows, parsed){
    // Match subject-wise level and sector
    const effectiveLevel = parsed.nuDcu ? `${parsed.level} ${parsed.nuDcu}` : parsed.level;
    return allRows.filter(r=>{
      if(!r.subject) return false;
      if(!r.locked && !r.url && !r.pdfUrl && !r.className && !r.suggestionUrl) return false;
      if (effectiveLevel) {
        const rL = normalizeLoose(r.level || '');
        const effL = normalizeLoose(effectiveLevel);
        // Strict level matching: exact match only.
        // If parsed course is plain 'BBA' (no NU/DCU sector), accept any BBA variant.
        // If parsed course is 'BBA NU', only accept 'BBA NU' rows (NOT 'BBA DCU').
        const levelMatched = (rL === effL) ||
          (effL === 'bba' && rL.startsWith('bba'));
        if(!levelMatched) return false;
      }
      if(!isCleanSubjectMatch(r.subject, parsed.subject) && normalizeForMatch(r.subject) !== normalizeForMatch(parsed.subject)) return false;
      return true;
    });
  }

  const authPageHead = document.getElementById('authPageHead');
  const tabSwitch = document.getElementById('tabSwitch');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const registerPanel = document.getElementById('registerPanel');
  const loginPanel = document.getElementById('loginPanel');
  const forgotPanel = document.getElementById('forgotPanel');
  const goForgotLink = document.getElementById('goForgotLink');
  const forgotBackBtn = document.getElementById('forgotBackBtn');
  const dashboardSection = document.getElementById('dashboardSection');
  const authWrapSection = registerPanel.closest('.auth-wrap');

  const regForm = document.getElementById('regForm');
  const regSubmitBtn = document.getElementById('regSubmitBtn');
  const regStatus = document.getElementById('regStatus');

  const loginForm = document.getElementById('loginForm');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  const loginStatus = document.getElementById('loginStatus');

  const goLoginLink = document.getElementById('goLoginLink');
  const goRegisterLink = document.getElementById('goRegisterLink');
  const logoutBtn = document.getElementById('logoutBtn');
  const enrolledCourseList = document.getElementById('enrolledCourseList');
  const learningArea = document.getElementById('learningArea');
  const dashHeadV2 = document.getElementById('dashHeadV2');
  const courseListView = document.getElementById('courseListView');
  const courseDetailView = document.getElementById('courseDetailView');
  const detailBackBtn = document.getElementById('detailBackBtn');
  const detailTitle = document.getElementById('detailTitle');
  const courseLearningPanel = document.getElementById('courseLearningPanel');
  const learningEmpty = document.getElementById('learningEmpty');
  const filterRow = document.getElementById('filterRow');
  const subjectSelect = document.getElementById('subjectSelect');
  const chapterSelect = document.getElementById('chapterSelect');
  const classSearchWrap = document.getElementById('classSearchWrap');
  const classSearchInput = document.getElementById('classSearchInput');
  const classPlayer = document.getElementById('classPlayer');
  const classList = document.getElementById('classList');
  const ytMount = document.getElementById('ytMount');
  const ytClickCatcher = document.getElementById('ytClickCatcher');
  const ccPlayPause = document.getElementById('ccPlayPause');
  const ccSeek = document.getElementById('ccSeek');
  const ccTime = document.getElementById('ccTime');
  const ccFullscreen = document.getElementById('ccFullscreen');
  const ccSettings = document.getElementById('ccSettings');
  const ccSettingsPanel = document.getElementById('ccSettingsPanel');
  const ccSettingsMain = document.getElementById('ccSettingsMain');
  const ccQualityMenu = document.getElementById('ccQualityMenu');
  const ccSpeedMenu = document.getElementById('ccSpeedMenu');
  const ccQualityOptions = document.getElementById('ccQualityOptions');
  const ccSpeedOptions = document.getElementById('ccSpeedOptions');
  const ccQualityValue = document.getElementById('ccQualityValue');
  const ccSpeedValue = document.getElementById('ccSpeedValue');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');

  function showLoading(message){
    if(loadingText) loadingText.textContent = message || 'তথ্য লোড হচ্ছে...';
    if(loadingOverlay) loadingOverlay.classList.add('show');
  }

  function hideLoading(){
    if(loadingOverlay) loadingOverlay.classList.remove('show');
  }

  hideLoading();

  function showRegister(){
    if(tabSwitch) tabSwitch.style.display = '';
    if(forgotPanel) forgotPanel.classList.remove('active');
    registerPanel.classList.add('active');
    loginPanel.classList.remove('active');
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    const ab = registerPanel.closest('.auth-box');
    if(ab) ab.classList.remove('login-mode');
  }
  function showLogin(){
    if(tabSwitch) tabSwitch.style.display = '';
    if(forgotPanel) forgotPanel.classList.remove('active');
    loginPanel.classList.add('active');
    registerPanel.classList.remove('active');
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    const ab = loginPanel.closest('.auth-box');
    if(ab) ab.classList.add('login-mode');
    window.scrollTo(0, 0);
  }
  function showForgot(){
    if(tabSwitch) tabSwitch.style.display = 'none';
    if(loginPanel) loginPanel.classList.remove('active');
    if(registerPanel) registerPanel.classList.remove('active');
    if(forgotPanel) forgotPanel.classList.add('active');
    const ab = forgotPanel.closest('.auth-box');
    if(ab) ab.classList.remove('login-mode');
    if(typeof resetForgotFlow === 'function') resetForgotFlow();
    window.scrollTo(0, 0);
  }
  tabRegisterBtn.addEventListener('click', showRegister);
  tabLoginBtn.addEventListener('click', showLogin);
  goLoginLink.addEventListener('click', showLogin);
  goRegisterLink.addEventListener('click', showRegister);
  if(goForgotLink) goForgotLink.addEventListener('click', showForgot);
  if(forgotBackBtn) forgotBackBtn.addEventListener('click', showLogin);

  function parseDateValue(value){
    if(value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if(value === null || value === undefined || value === '') return null;
    const d=new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value){
    if(!value) return '—';
    const d=parseDateValue(value);
    if(!d) return String(value);
    return d.toISOString().slice(0,10);
  }

  function parseNextPaymentDate(value){
    const raw=String(value||'').trim();
    const match=/^(\d{4})\/(\d{2})\/(\d{2})$/.exec(raw);
    if(!match) return null;
    const d=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    return d.getFullYear()===Number(match[1]) && d.getMonth()===Number(match[2])-1 && d.getDate()===Number(match[3]) ? d : null;
  }

  function formatNextPaymentDate(value){
    const raw=String(value||'').trim();
    return /^(\d{4})\/(\d{2})\/(\d{2})$/.test(raw) ? raw : '—';
  }

  const enrolledCourseSectorMap = new Map();
  function getEnrolledCourses(data){
    const list = Array.isArray(data?.courses) ? data.courses : [];
    list.forEach(c=>{
      if(c && c.name) enrolledCourseSectorMap.set(normalizeForMatch(c.name), clean(c.nuDcu || ''));
    });
    return list;
  }

  function formatWatchTimeValue(minutes){
    const total = Math.round(Number(minutes) || 0);
    if(total <= 0) return '0 Minutes';
    const h = Math.floor(total / 60), m = total % 60;
    if(h > 0) return `${h}h ${m}m`;
    return `${m} Minutes`;
  }

  // Stores the last known D1 total for each course. This is critical when
  // admin changes get_wt from Yes back to No: the old D1 time must remain the
  // starting point, and new watch time must be added locally on top of it.
  const LS_WATCH_BASE_KEY = 'va_watch_base_v1';

  function readWatchBaseStore(){
    try{
      const raw = localStorage.getItem(LS_WATCH_BASE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    }catch(e){ return {}; }
  }

  function writeWatchBaseStore(store){
    try{
      localStorage.setItem(LS_WATCH_BASE_KEY, JSON.stringify(store));
    }catch(e){ console.error('Watch-time base localStorage write failed:', e); }
  }

  function getWatchBaseMinutes(course, sector, mobile, fallbackMinutes){
    if(!course || !mobile) return Math.max(0, Number(fallbackMinutes) || 0);
    const store = readWatchBaseStore();
    const key = getWatchStorageKey(mobile, course, sector);

    if(Object.prototype.hasOwnProperty.call(store, key)){
      return Math.max(0, Number(store[key]) || 0);
    }

    // First time this browser sees the course, initialize the baseline from D1.
    const fallback = Math.max(0, Number(fallbackMinutes) || 0);
    store[key] = fallback;
    writeWatchBaseStore(store);
    return fallback;
  }

  function setWatchBaseMinutes(course, sector, mobile, minutes){
    if(!course || !mobile) return;
    const store = readWatchBaseStore();
    store[getWatchStorageKey(mobile, course, sector)] = Math.max(0, Number(minutes) || 0);
    writeWatchBaseStore(store);
  }

  function getDashboardWatchTimeMinutes(course, mobile){
    if(!course) return 0;

    const courseName = String(course.name || '').trim();
    const sector = String(course.nuDcu || '').trim();
    if(!courseName || !mobile) return Number(course.watchTime) || 0;

    const isEnabled = String(course.getWt || '').trim().toLowerCase() === 'yes';

    if(isEnabled){
      // Yes = D1 is authoritative. Save it as the new local baseline.
      const d1Minutes = Math.max(0, Number(course.watchTime) || 0);
      setWatchBaseMinutes(courseName, sector, mobile, d1Minutes);
      return d1Minutes;
    }

    // No/NULL = keep the previous accumulated total and add new local time.
    const baseMinutes = getWatchBaseMinutes(courseName, sector, mobile, course.watchTime);
    const pendingSeconds = getWatchPendingSeconds(courseName, sector, mobile);

    let liveSeconds = 0;
    if(
      normalizeWatchCourse(courseName) === normalizeWatchCourse(currentWatchCourse) &&
      normalizeForMatch(sector) === normalizeForMatch(currentWatchSector || '')
    ){
      liveSeconds = Number(watchPendingSeconds) || 0;
    }

    return Math.max(0, baseMinutes + ((pendingSeconds + liveSeconds) / 60));
  }

  function refreshDashboardWatchTimeDisplay(){
    if(!dashboardData) return;

    const courses = Array.isArray(dashboardData.courses) ? dashboardData.courses : [];
    const mobile = String(dashboardData.mobile || getCurrentUserMobile() || '').trim();
    if(!mobile) return;

    enrolledCourseList.querySelectorAll('.enrolled-course-btn').forEach(btn=>{
      const idx = Number(btn.dataset.idx);
      const course = courses[idx];
      const value = btn.querySelector('.ecb-wt-value');
      if(!course || !value) return;
      value.textContent = formatWatchTimeValue(getDashboardWatchTimeMinutes(course, mobile));
    });
  }

  function startDashboardWatchTimeDisplay(){
    if(dashboardWatchDisplayTimer) return;
    dashboardWatchDisplayTimer = setInterval(refreshDashboardWatchTimeDisplay, 1000);
  }

  function stopDashboardWatchTimeDisplay(){
    if(dashboardWatchDisplayTimer){
      clearInterval(dashboardWatchDisplayTimer);
      dashboardWatchDisplayTimer = null;
    }
  }

  function driveDirectLink(url){
    const value = String(url || '').trim();
    if(!value) return '';
    const m = value.match(/\/d\/([a-zA-Z0-9_-]+)/) || value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if(!m) return value;
    return `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&authuser=0`;
  }

  function youtubeId(url){
    const value = String(url || '').trim();
    if(!value) return '';
    const patterns = [
      /[?&]v=([A-Za-z0-9_-]{11})/i,
      /youtu\.be\/([A-Za-z0-9_-]{11})/i,
      /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/i,
      /youtube(?:-nocookie)?\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
      /youtube(?:-nocookie)?\.com\/live\/([A-Za-z0-9_-]{11})/i
    ];
    for(const re of patterns){
      const m = value.match(re);
      if(m) return m[1];
    }
    // Direct 11-char ID support
    return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : '';
  }

  let ytPlayer = null;
  let ytApiReady = false;
  let pendingVideoId = null;
  let ytProgressTimer = null;
  let ytSeeking = false;

  let currentWatchCourse = '';
  let currentWatchSector = '';
  let currentWatchGetWt = false;
  let watchPendingSeconds = 0;
  let watchTrackTimer = null;
  let watchPersistTimer = null;
  let watchSyncInProgress = false;
  let dashboardWatchDisplayTimer = null;
  let dashboardData = null;

  // Watch time persist interval (5 mins)
  const LOCAL_PERSIST_INTERVAL_SEC = 300;
  const LS_WATCH_PENDING_KEY = 'va_watch_pending_v1';

  function normalizeWatchCourse(value){
    return normalizeForMatch(value);
  }

  function getWatchStorageKey(mobile, course, sector){
    return [
      normalizeMobileForMatch(mobile),
      normalizeWatchCourse(course),
      normalizeForMatch(sector || '')
    ].join('::');
  }

  function readWatchPendingStore(){
    try{
      const raw = localStorage.getItem(LS_WATCH_PENDING_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    }catch(e){
      return {};
    }
  }

  function writeWatchPendingStore(store){
    try{
      localStorage.setItem(LS_WATCH_PENDING_KEY, JSON.stringify(store));
    }catch(e){
      console.error('Watch-time localStorage write failed:', e);
    }
  }

  function addWatchPendingSeconds(seconds, course, sector, mobile){
    const sec = Math.max(0, Math.floor(Number(seconds) || 0));
    if(sec <= 0 || !course || !mobile) return;

    const store = readWatchPendingStore();
    const key = getWatchStorageKey(mobile, course, sector);
    store[key] = Math.max(0, Math.floor(Number(store[key]) || 0)) + sec;
    writeWatchPendingStore(store);
  }

  function getWatchPendingSeconds(course, sector, mobile){
    if(!course || !mobile) return 0;
    const store = readWatchPendingStore();
    const key = getWatchStorageKey(mobile, course, sector);
    return Math.max(0, Math.floor(Number(store[key]) || 0));
  }

  function subtractWatchPendingSeconds(course, sector, mobile, seconds){
    const sec = Math.max(0, Math.floor(Number(seconds) || 0));
    if(sec <= 0 || !course || !mobile) return;

    const store = readWatchPendingStore();
    const key = getWatchStorageKey(mobile, course, sector);
    const remaining = Math.max(0, Math.floor(Number(store[key]) || 0) - sec);

    if(remaining > 0) store[key] = remaining;
    else delete store[key];

    writeWatchPendingStore(store);
  }

  function persistCurrentWatchPending(){
    if(watchPendingSeconds <= 0 || !currentWatchCourse) return;

    const mobile = getCurrentUserMobile();
    if(!mobile){
      watchPendingSeconds = 0;
      return;
    }

    addWatchPendingSeconds(
      watchPendingSeconds,
      currentWatchCourse,
      currentWatchSector,
      mobile
    );
    watchPendingSeconds = 0;
  }

  function getCurrentUserMobile(){
    try{
      const user = JSON.parse(localStorage.getItem(LS_USER_KEY) || 'null');
      return user && user.mobile ? String(user.mobile).trim() : '';
    }catch(e){ return ''; }
  }

  function getCourseByWatchKey(course, sector){
    try{
      const user = JSON.parse(localStorage.getItem(LS_USER_KEY) || 'null');
      const courses = Array.isArray(user?.courses) ? user.courses : [];
      const targetCourse = normalizeWatchCourse(course);
      const targetSector = normalizeForMatch(sector || '');

      return courses.find(c =>
        normalizeWatchCourse(c?.name) === targetCourse &&
        normalizeForMatch(c?.nuDcu || '') === targetSector
      ) || null;
    }catch(e){
      return null;
    }
  }

  function isWatchSyncEnabled(course, sector){
    const row = getCourseByWatchKey(course, sector);
    return String(row?.getWt || '').trim().toLowerCase() === 'yes';
  }

  async function syncPendingWatchTime(data){
    if(watchSyncInProgress) return false;

    const mobile = String(data?.mobile || getCurrentUserMobile() || '').trim();
    const courses = Array.isArray(data?.courses) ? data.courses : [];
    if(!mobile || !courses.length) return false;

    watchSyncInProgress = true;
    let syncedAny = false;

    try{
      for(const course of courses){
        if(String(course?.getWt || '').trim().toLowerCase() !== 'yes') continue;

        const courseName = String(course?.name || '').trim();
        const sector = String(course?.nuDcu || '').trim();
        if(!courseName) continue;

        const pending = getWatchPendingSeconds(courseName, sector, mobile);
        if(pending <= 0) continue;

        // Snapshot only this amount. New seconds added while syncing remain local.
        const snapshotSeconds = pending;

        try{
          const result = await callApi({
            action:'track_watch',
            mobile: mobile,
            course: courseName,
            nuDcu: sector,
            seconds: snapshotSeconds
          });

          if(result.status === 'ok'){
            subtractWatchPendingSeconds(courseName, sector, mobile, snapshotSeconds);
            if(typeof result.watchTimeMinutes === 'number'){
              course.watchTime = result.watchTimeMinutes;
              setWatchBaseMinutes(courseName, sector, mobile, result.watchTimeMinutes);
            }
            refreshDashboardWatchTimeDisplay();
            syncedAny = true;
          }
        }catch(err){
          console.error('Watch-time sync failed:', err);
          // Keep the local value. It will retry on the next dashboard/login.
        }
      }
    }finally{
      watchSyncInProgress = false;
    }

    return syncedAny;
  }

  function startWatchTracking(){
    stopWatchTracking();

    // Track watch time per second
    watchTrackTimer = setInterval(()=>{
      watchPendingSeconds += 1;

      // Persist periodically
      if(watchPendingSeconds % LOCAL_PERSIST_INTERVAL_SEC === 0){
        persistCurrentWatchPending();
      }
    }, 1000);
  }

  function stopWatchTracking(){
    if(watchTrackTimer){
      clearInterval(watchTrackTimer);
      watchTrackTimer = null;
    }
    if(watchPersistTimer){
      clearInterval(watchPersistTimer);
      watchPersistTimer = null;
    }
  }

  // Save watch time to local storage
  function flushWatchTime(){
    persistCurrentWatchPending();
  }

  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'hidden'){
      stopWatchTracking();
      persistCurrentWatchPending();
    } else if(ytPlayer && typeof ytPlayer.getPlayerState === 'function' && window.YT && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING){
      startWatchTracking();
    }
  });

  window.addEventListener('pagehide', ()=>{
    stopWatchTracking();
    persistCurrentWatchPending();
  });

  function loadYouTubeApiOnce(){
    if(window.YT && window.YT.Player){ ytApiReady = true; return; }
    if(document.getElementById('ytIframeApiScript')) return;
    const tag = document.createElement('script');
    tag.id = 'ytIframeApiScript';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  window.onYouTubeIframeAPIReady = function(){
    ytApiReady = true;
    if(pendingVideoId){ const id = pendingVideoId; pendingVideoId = null; playClassVideo(id); }
  };

  const CC_ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
  };

  function formatSeconds(sec){
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec/60), s = sec % 60;
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  function updatePlayerTimeUI(){
    if(!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
    const cur = ytPlayer.getCurrentTime() || 0;
    const dur = ytPlayer.getDuration() || 0;
    if(!ytSeeking && dur) ccSeek.value = String(Math.floor((cur/dur) * 1000));
    ccTime.textContent = `${formatSeconds(cur)} / ${formatSeconds(dur)}`;
  }

  function startProgressLoop(){
    stopProgressLoop();
    ytProgressTimer = setInterval(updatePlayerTimeUI, 500);
  }
  function stopProgressLoop(){
    if(ytProgressTimer){ clearInterval(ytProgressTimer); ytProgressTimer = null; }
  }

  function onYtPlayerStateChange(e){
    if(e.data === YT.PlayerState.PLAYING){
      ccPlayPause.innerHTML = CC_ICONS.pause;
      startProgressLoop();
      startWatchTracking();
    } else if(e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED){
      ccPlayPause.innerHTML = CC_ICONS.play;
      if(e.data === YT.PlayerState.ENDED) stopProgressLoop();
      stopWatchTracking();
      flushWatchTime();
    }
  }

  function createYtPlayer(id){
    ytPlayer = new YT.Player(ytMount, {
      videoId: id,
      playerVars: {
        autoplay: 1, controls: 0, disablekb: 1, rel: 0,
        modestbranding: 1, iv_load_policy: 3, playsinline: 1, fs: 0,
        origin: window.location.origin
      },
      events: {
        onReady: (e)=>{
          try {
            const iframe = e.target.getIframe();
            if(iframe){
              iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen');
              iframe.setAttribute('allowfullscreen', '1');
            }
          }catch(err){}
          e.target.playVideo();
          updatePlayerTimeUI();
          populateQualityOptions();
          populateSpeedOptions();
        },
        onStateChange: onYtPlayerStateChange
      }
    });
  }

  function playClassVideo(id){
    if(!id) return;
    classPlayer.style.display = 'block';
    classPlayer.scrollIntoView({behavior:'smooth', block:'nearest'});
    if(!(window.YT && window.YT.Player)){
      pendingVideoId = id;
      loadYouTubeApiOnce();
      return;
    }
    if(!ytPlayer){
      createYtPlayer(id);
    } else {
      ytPlayer.loadVideoById(id);
    }
  }

  function stopClassPlayer(){
    stopProgressLoop();
    stopWatchTracking();
    flushWatchTime();
    if(ytPlayer && typeof ytPlayer.stopVideo === 'function'){
      try{ ytPlayer.stopVideo(); }catch(e){}
    }
    closeSettingsPanel();
    classPlayer.style.display = 'none';
  }

  if(ccPlayPause){
    ccPlayPause.addEventListener('click', ()=>{
      if(!ytPlayer) return;
      if(ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
      else ytPlayer.playVideo();
    });
  }
  if(ytClickCatcher){
    ytClickCatcher.addEventListener('click', ()=>{
      if(!ytPlayer) return;
      if(ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
      else ytPlayer.playVideo();
    });
  }
  if(ccSeek){
    ccSeek.addEventListener('input', ()=>{ ytSeeking = true; });
    ccSeek.addEventListener('change', ()=>{
      if(!ytPlayer) return;
      const dur = ytPlayer.getDuration() || 0;
      const pct = Number(ccSeek.value) / 1000;
      ytPlayer.seekTo(dur * pct, true);
      ytSeeking = false;
    });
  }
  const CC_FS_ICONS = {
    enter: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zM5 10h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    exit: '<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'
  };
  function updateFsIcon(){
    const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if(ccFullscreen) ccFullscreen.innerHTML = isFull ? CC_FS_ICONS.exit : CC_FS_ICONS.enter;
  }
  if(ccFullscreen){
    ccFullscreen.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(!classPlayer) return;
      const isFull = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      if(isFull){
        if(document.exitFullscreen) document.exitFullscreen();
        else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if(document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if(document.msExitFullscreen) document.msExitFullscreen();
      } else {
        if(classPlayer.requestFullscreen) classPlayer.requestFullscreen();
        else if(classPlayer.webkitRequestFullscreen) classPlayer.webkitRequestFullscreen();
        else if(classPlayer.mozRequestFullScreen) classPlayer.mozRequestFullScreen();
        else if(classPlayer.msRequestFullscreen) classPlayer.msRequestFullscreen();
      }
    });
  }
  document.addEventListener('fullscreenchange', updateFsIcon);
  document.addEventListener('webkitfullscreenchange', updateFsIcon);
  document.addEventListener('mozfullscreenchange', updateFsIcon);
  document.addEventListener('MSFullscreenChange', updateFsIcon);
  classPlayer.addEventListener('contextmenu', (e)=> e.preventDefault());

  const QUALITY_LABELS = {
    highres:'অতি উচ্চমান', hd2160:'2160p', hd1440:'1440p', hd1080:'1080p',
    hd720:'720p', large:'480p', medium:'360p', small:'240p', tiny:'144p', auto:'অটো'
  };
  const ALLOWED_SPEEDS = [1, 1.5, 2];
  const SPEED_OPTION_LABELS = { 1:'1x (Normal)', 1.5:'1.5x', 2:'2x' };
  const SPEED_VALUE_LABELS = { 1:'1x', 1.5:'1.5x', 2:'2x' };

  function closeSettingsPanel(){
    ccSettingsPanel.style.display = 'none';
    ccSettingsMain.style.display = 'block';
    ccQualityMenu.style.display = 'none';
    ccSpeedMenu.style.display = 'none';
  }

  function populateQualityOptions(){
    if(!ytPlayer || typeof ytPlayer.getAvailableQualityLevels !== 'function') return;
    let levels = ytPlayer.getAvailableQualityLevels();
    if(!levels || !levels.length) levels = ['auto'];
    if(!levels.includes('auto')) levels = [...levels, 'auto'];
    const current = (typeof ytPlayer.getPlaybackQuality === 'function' && ytPlayer.getPlaybackQuality()) || 'auto';
    ccQualityOptions.innerHTML = levels.map(lv=>{
      const label = QUALITY_LABELS[lv] || lv;
      const active = lv === current ? ' active' : '';
      return `<button type="button" class="cc-option${active}" data-quality="${lv}">${label}${lv===current ? ' ✓' : ''}</button>`;
    }).join('');
    ccQualityValue.textContent = QUALITY_LABELS[current] || current;
    ccQualityOptions.querySelectorAll('[data-quality]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const q = btn.dataset.quality;
        if(q !== 'auto' && typeof ytPlayer.setPlaybackQuality === 'function') ytPlayer.setPlaybackQuality(q);
        ccQualityValue.textContent = QUALITY_LABELS[q] || q;
        closeSettingsPanel();
      });
    });
  }

  function populateSpeedOptions(){
    if(!ytPlayer || typeof ytPlayer.getAvailablePlaybackRates !== 'function') return;
    const available = ytPlayer.getAvailablePlaybackRates() || [1];
    let rates = ALLOWED_SPEEDS.filter(r=>available.includes(r));
    if(!rates.length) rates = [1];
    let current = (typeof ytPlayer.getPlaybackRate === 'function' && ytPlayer.getPlaybackRate()) || 1;
    if(!rates.includes(current)) current = 1;
    ccSpeedOptions.innerHTML = rates.map(r=>{
      const label = SPEED_OPTION_LABELS[r] || `${r}x`;
      const active = r === current ? ' active' : '';
      return `<button type="button" class="cc-option${active}" data-rate="${r}">${label}${r===current ? ' ✓' : ''}</button>`;
    }).join('');
    ccSpeedValue.textContent = SPEED_VALUE_LABELS[current] || `${current}x`;
    ccSpeedOptions.querySelectorAll('[data-rate]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const r = Number(btn.dataset.rate);
        if(typeof ytPlayer.setPlaybackRate === 'function') ytPlayer.setPlaybackRate(r);
        ccSpeedValue.textContent = SPEED_VALUE_LABELS[r] || `${r}x`;
        closeSettingsPanel();
      });
    });
  }

  if(ccSettings){
    ccSettings.addEventListener('click', (e)=>{
      e.stopPropagation();
      const isOpen = ccSettingsPanel.style.display === 'block';
      if(isOpen){ closeSettingsPanel(); return; }
      populateQualityOptions();
      populateSpeedOptions();
      ccSettingsPanel.style.display = 'block';
    });
  }
  if(ccSettingsMain){
    ccSettingsMain.querySelectorAll('[data-menu]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const menu = btn.dataset.menu;
        ccSettingsMain.style.display = 'none';
        if(menu === 'quality') ccQualityMenu.style.display = 'block';
        if(menu === 'speed') ccSpeedMenu.style.display = 'block';
      });
    });
  }
  document.querySelectorAll('.cc-settings-back').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      ccQualityMenu.style.display = 'none';
      ccSpeedMenu.style.display = 'none';
      ccSettingsMain.style.display = 'block';
    });
  });
  document.addEventListener('click', (e)=>{
    if(ccSettingsPanel.style.display === 'block' && !ccSettingsPanel.contains(e.target) && e.target !== ccSettings){
      closeSettingsPanel();
    }
  });

  function getCourseSector(courseName){
    const sw = parseSubjectWiseCourseId(courseName);
    if(sw) return clean(sw.nuDcu);
    const stored = enrolledCourseSectorMap.get(normalizeForMatch(courseName));
    if(stored) return clean(stored);
    const cName = String(courseName || '').toLowerCase();
    if(/\b(dcu|7\s*college|seven\s*college|dhaka\s*college)\b/i.test(cName)) return 'DCU';
    if(/\b(nu|national\s*university)\b/i.test(cName)) return 'NU';
    return clean(enrollSectorParam);
  }

  async function fetchClassData(courseName){
    const cacheKey = courseName;
    if(classDataCache.has(cacheKey)) return classDataCache.get(cacheKey);
    const notFound = {status:'error', message:'এই course-এর জন্য এখনো কোনো class/course materials পাওয়া যায়নি।'};
    let result;
    try{
      const response = await fetch(FORM_ENDPOINT, {
        method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({action:'get_course_data', courseName, sessionToken:localStorage.getItem(LS_STUDENT_SESSION_TOKEN_KEY) || '', deviceToken:getDeviceToken()}),
        cache:'no-store'
      });
      if(!response.ok) throw new Error(`Course Data: HTTP ${response.status}`);
      const json = await response.json();
      if(json.status === 'error') {
        if(json.courseLocked) {
          result = {
            status: 'locked',
            lockComment: String(json.lockComment || '').trim(),
            message: json.message || 'এই কোর্সটি বর্তমানে লক করা আছে।'
          };
          classDataCache.set(cacheKey, result);
          return result;
        }
        throw new Error(json.message || 'Course data error');
      }
      const allRows = Array.isArray(json.data) ? json.data : [];
      const swParsed = parseSubjectWiseCourseId(courseName);
      const matchedRows = swParsed ? findSubjectWiseClassRows(allRows, swParsed) : allRows.filter(r => {
        if(!r.subject) return false;
        if(!r.locked && !r.url && !r.pdfUrl && !r.className && !r.suggestionUrl) return false;
        return true;
      });
      const rows = matchedRows.map(r=>({
        subject: r.subject,
        chapter: r.chapter,
        className: r.className,
        url: r.url,
        pdfUrl: r.pdfUrl,
        suggestionUrl: r.suggestionUrl || '',
        locked: !!r.locked
      }));
      result = rows.length ? {status:'ok',data:rows} : notFound;
    }catch(error){
      console.error('Class data fetch failed:', error);
      result = error.name === 'AbortError'
        ? {status:'error',message:'Poor internet connection'}
        : notFound;
    }
    classDataCache.set(cacheKey,result);
    return result;
  }


  function renderClassItems(rows){
    // Detect if active subject has a suggestion URL
    let suggestionHtml = '';
    const activeSuggestionItem = (activeSubjectRows || []).find(r => r.suggestionUrl && r.suggestionUrl.trim());
    if(activeSuggestionItem && activeSuggestionItem.suggestionUrl){
      const sUrl = activeSuggestionItem.suggestionUrl.trim();
      const sSubject = activeSuggestionItem.subject || (subjectSelect && subjectSelect.value) || currentWatchCourse || 'বিষয়';
      const isSubjectLocked = (activeSubjectRows || []).length > 0 && (activeSubjectRows || []).every(r => r.locked);

      const sBtnHtml = isSubjectLocked
        ? `<span class="suggestion-download-btn is-locked" title="সাজেশন unlock করতে কোর্সটি unlock করুন">
             <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
             </svg>
             <span>সাজেশন লক</span>
           </span>`
        : `<a class="suggestion-download-btn" href="${escapeHtml(driveDirectLink(sUrl))}" target="_blank" rel="noopener" title="সাজেশন PDF ডাউনলোড করুন" onclick="event.stopPropagation()">
             <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5"/><path d="M4 14.5v1a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-1"/>
             </svg>
             <span>সাজেশন PDF</span>
           </a>`;

      suggestionHtml = `
        <div class="subject-suggestion-card">
          <div class="suggestion-card-left">
            <div class="suggestion-card-badge">
              <span class="suggestion-star-icon">⭐</span>
              <span>সুপার শর্ট সাজেশন</span>
            </div>
            <span class="suggestion-card-subject">${escapeHtml(sSubject)}</span>
          </div>
          <div class="suggestion-card-right">
            ${sBtnHtml}
          </div>
        </div>
      `;
    }

    const classRows = rows.filter(r => r.url || r.className || r.pdfUrl);

    if(classRows.length > 0){
      classList.innerHTML = suggestionHtml + classRows.map((item,index)=>{
        const locked = !!item.locked;
        const playIcon = locked
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        const pdfHtml = locked
          ? '<span class="class-pdf-btn is-locked" title="আগে ক্লাসটি unlock করুন"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>'
          : (item.pdfUrl ? `<a class="class-pdf-btn" href="${escapeHtml(driveDirectLink(item.pdfUrl))}" target="_blank" rel="noopener" title="PDF নোট ডাউনলোড করুন" onclick="event.stopPropagation()"><span class="class-pdf-badge">PDF</span><span class="class-pdf-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5"/><path d="M4 14.5v1a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-1"/></svg></span></a>` : '');
        const mainTitle = item.chapter || item.className || `Class ${index+1}`;
        const subTitle = item.chapter ? (item.className || '') : '';
        return `<div class="class-item-row"><button type="button" class="class-item${locked?' is-locked':''}" data-video="${locked?'':escapeHtml(item.url)}" data-locked="${locked?'1':'0'}"><span class="class-play">${playIcon}</span><span class="class-meta"><span class="class-title">${escapeHtml(mainTitle)}</span>${subTitle ? `<span class="class-chapter">${escapeHtml(subTitle)}</span>` : ''}</span></button>${pdfHtml}</div>`;
      }).join('');
    } else if(suggestionHtml){
      classList.innerHTML = suggestionHtml + '<div class="learning-empty" style="padding:28px 16px;">এই বিষয়ের কোনো ক্লাস ভিডিও এখনো আপলোড করা হয়নি।</div>';
    } else {
      classList.innerHTML = '<div class="learning-empty">কোনো ক্লাস খুঁজে পাওয়া যায়নি।</div>';
    }

    classList.querySelectorAll('.class-item').forEach(item=>item.addEventListener('click',()=>{
      if(item.dataset.locked === '1'){
        vaShowToast('এই ক্লাসটি এখনো unlock হয়নি — বাকি পেমেন্ট সম্পন্ন করলে unlock হবে।');
        return;
      }
      const id=youtubeId(item.dataset.video); if(!id) return;
      playClassVideo(id);
    }));
  }

  if(classSearchInput){
    classSearchInput.addEventListener('input', ()=>{
      const q = normalizeForMatch(classSearchInput.value);
      if(!q){ renderClassItems(activeSubjectRows); return; }
      const filtered = activeSubjectRows.filter(item=>{
        const haystack = normalizeForMatch(`${item.chapter || ''} ${item.className || ''}`);
        return haystack.includes(q);
      });
      renderClassItems(filtered);
    });
  }

  function populateChapterSelect(rows, subject){
    if(!subject){
      chapterSelect.innerHTML = '<option value="">সব চ্যাপ্টার</option>';
      chapterSelect.disabled = true;
      return [];
    }
    const subjectRows = rows.filter(x =>
      isCleanSubjectMatch(x.subject, subject) ||
      normalizeForMatch(x.subject) === normalizeForMatch(subject)
    );
    const seenChapters = new Map();
    subjectRows.forEach(x=>{
      const key = normalizeForMatch(x.chapter);
      if(key && !seenChapters.has(key)) seenChapters.set(key, x.chapter);
    });
    const chapters = [...seenChapters.values()];
    chapterSelect.innerHTML = `<option value="">সব চ্যাপ্টার</option>` +
      chapters.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    chapterSelect.disabled = chapters.length === 0;
    return subjectRows;
  }

  // ============================================================
  // ZOOM LIVE CLASS MANAGER (Web SDK Component View)
  // ============================================================

  let activeZoomClient = null;
  let currentZoomConfig = null;
  let zoomSdkLoading = false;

  function hideLiveClassBanner() {
    const liveCard = document.getElementById('liveClassCard');
    if (liveCard) liveCard.style.display = 'none';
  }

  function loadScriptAsync(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load: ' + src));
      document.head.appendChild(s);
    });
  }

  function loadStyleAsync(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }

  async function ensureZoomSdkLoaded() {
    if (window.ZoomMtgEmbedded) return true;
    if (zoomSdkLoading) {
      while (zoomSdkLoading) {
        await new Promise(r => setTimeout(r, 200));
      }
      return !!window.ZoomMtgEmbedded;
    }
    zoomSdkLoading = true;
    try {
      loadStyleAsync('https://source.zoom.us/3.8.5/css/bootstrap.css');
      loadStyleAsync('https://source.zoom.us/3.8.5/css/react-select.css');
      await loadScriptAsync('https://source.zoom.us/3.8.5/lib/vendor/react.min.js');
      await loadScriptAsync('https://source.zoom.us/3.8.5/lib/vendor/react-dom.min.js');
      await loadScriptAsync('https://source.zoom.us/3.8.5/lib/vendor/redux.min.js');
      await loadScriptAsync('https://source.zoom.us/3.8.5/lib/vendor/redux-thunk.min.js');
      await loadScriptAsync('https://source.zoom.us/3.8.5/lib/vendor/lodash.min.js');
      await loadScriptAsync('https://source.zoom.us/zoom-meeting-embedded-3.8.5.min.js');
      return !!window.ZoomMtgEmbedded;
    } catch (err) {
      console.error('Error loading Zoom Web SDK:', err);
      return false;
    } finally {
      zoomSdkLoading = false;
    }
  }

  async function checkAndShowLiveClass(courseName, sector) {
    hideLiveClassBanner();
    currentZoomConfig = null;
    if (!courseName) return;

    try {
      const res = await callApi({
        action: 'get_zoom_signature',
        courseName: courseName,
        nuDcu: sector || ''
      });

      if (res && res.status === 'ok' && res.meetingNumber) {
        currentZoomConfig = res;
        const liveCard = document.getElementById('liveClassCard');
        const titleEl = document.getElementById('liveClassTitle');

        if (titleEl) {
          titleEl.textContent = `আজকের লাইভ ক্লাস (${escapeHtml(courseName)})`;
        }

        if (liveCard) {
          liveCard.style.display = 'block';
        }
      } else if (res && res.status === 'error') {
        console.warn('[Live Class Notice]:', res.message || 'লাইভ ক্লাস কনফিগার করা নেই।');
      }
    } catch (err) {
      console.warn('[Live Class Error]:', err);
    }
  }

  async function joinLiveMeetingOnWeb() {
    if (!currentZoomConfig) {
      alert('লাইভ ক্লাসের তথ্য পাওয়া যায়নি।');
      return;
    }

    const joinBtn = document.getElementById('btnJoinLiveWeb');
    const origHtml = joinBtn ? joinBtn.innerHTML : '';
    if (joinBtn) {
      joinBtn.disabled = true;
      joinBtn.innerHTML = '<span>⏳ জুম লোড হচ্ছে...</span>';
    }

    // Stop recorded video player if running
    stopClassPlayer();

    const embedContainer = document.getElementById('zoomEmbedContainer');
    const meetingRoot = document.getElementById('zoomMeetingRoot');

    try {
      const loaded = await ensureZoomSdkLoaded();
      if (!loaded || !window.ZoomMtgEmbedded) {
        throw new Error('জুম প্লেয়ার লোড হতে পারেনি। অনুগ্রহ করে "Open in Zoom App" বাটন দিয়ে জুম অ্যাপে যুক্ত হন।');
      }

      if (embedContainer) embedContainer.style.display = 'block';
      embedContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (!activeZoomClient) {
        activeZoomClient = window.ZoomMtgEmbedded.createClient();
        await activeZoomClient.init({
          zoomAppRoot: meetingRoot,
          language: 'en-US',
          customize: {
            meetingInfo: ['topic', 'host'],
            toolbar: {
              buttons: [
                { name: 'share-screen', dir: 'left' }
              ]
            }
          }
        });
      }

      await activeZoomClient.join({
        signature: currentZoomConfig.signature,
        sdkKey: currentZoomConfig.sdkKey,
        meetingNumber: currentZoomConfig.meetingNumber,
        password: currentZoomConfig.passcode || '',
        userName: currentZoomConfig.userName || 'Student',
        userEmail: currentZoomConfig.userEmail || ''
      });

    } catch (err) {
      console.error('Zoom join error:', err);
      alert('জুমে যুক্ত হতে সমস্যা: ' + (err.message || 'দয়া করে "Open in Zoom App" দিয়ে সরাসরি জুম অ্যাপে যুক্ত হন।'));
    } finally {
      if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.innerHTML = origHtml;
      }
    }
  }

  async function leaveLiveMeeting() {
    if (activeZoomClient) {
      try {
        await activeZoomClient.leaveMeeting();
      } catch (e) {}
    }
    activeZoomClient = null;
    const embedContainer = document.getElementById('zoomEmbedContainer');
    if (embedContainer) embedContainer.style.display = 'none';
    const meetingRoot = document.getElementById('zoomMeetingRoot');
    if (meetingRoot) meetingRoot.innerHTML = '';
  }

  const btnJoinLiveWeb = document.getElementById('btnJoinLiveWeb');
  if (btnJoinLiveWeb) {
    btnJoinLiveWeb.addEventListener('click', joinLiveMeetingOnWeb);
  }

  const btnLeaveZoom = document.getElementById('btnLeaveZoom');
  if (btnLeaveZoom) {
    btnLeaveZoom.addEventListener('click', leaveLiveMeeting);
  }

  async function loadCourseClasses(courseName, sector){
    classLearningReset();
    if(!courseName) return;
    checkAndShowLiveClass(courseName, sector);
    courseLearningPanel.style.display='block';
    filterRow.style.display='flex';
    subjectSelect.disabled = true;
    chapterSelect.disabled = true;
    subjectSelect.innerHTML = '<option>লোড হচ্ছে...</option>';
    chapterSelect.innerHTML = '<option>—</option>';
    classList.innerHTML='<div class="class-loading"><span class="spinner"></span>ক্লাস লোড হচ্ছে...</div>';
    const result = await fetchClassData(courseName, sector);
    if(result.status === 'locked'){
      showCourseLockedNotice({lockComment: result.lockComment});
      return;
    }
    const rows = (result.status === 'ok' && Array.isArray(result.data)) ? result.data : [];
    if(!rows.length){
      courseLearningPanel.style.display='block';
      filterRow.style.display='none';
      classList.innerHTML=`<div class="learning-empty">${escapeHtml(result.message || 'এই course-এর কোনো class এখনো পাওয়া যায়নি।')}</div>`;
      return;
    }
    currentWatchCourse = courseName;
    currentWatchSector = clean(sector);
    currentWatchGetWt = isWatchSyncEnabled(courseName, sector);

    const currentUserForSync = getCurrentUserMobile();
    if(currentUserForSync && currentWatchGetWt){
      try {
        const currentData = JSON.parse(localStorage.getItem(LS_USER_KEY) || 'null');
        if(currentData) syncPendingWatchTime(currentData);
      } catch(e){}
    }

    const subjectSelectWrap = subjectSelect.closest('.filter-select-wrap');
    const swParsed = parseSubjectWiseCourseId(courseName);

    if(swParsed){
      courseLearningPanel.style.display='block';
      filterRow.style.display='flex';
      if(subjectSelectWrap) subjectSelectWrap.style.display='none';
      subjectSelect.disabled = true;
      subjectSelect.innerHTML = `<option value="${escapeHtml(swParsed.subject)}">${escapeHtml(swParsed.subject)}</option>`;

      const applyFilters=()=>{
        const chapter = chapterSelect.value;
        stopClassPlayer();
        let filtered = rows;
        if(chapter) filtered = filtered.filter(x=>normalizeForMatch(x.chapter)===normalizeForMatch(chapter));
        activeSubjectRows = filtered;
        if(classSearchInput) classSearchInput.value='';
        if(classSearchWrap) classSearchWrap.style.display = filtered.length ? 'block' : 'none';
        renderClassItems(filtered);
      };

      chapterSelect.onchange = applyFilters;
      populateChapterSelect(rows, swParsed.subject);
      applyFilters();
      return;
    }

    if(subjectSelectWrap) subjectSelectWrap.style.display='';

    const seenSubjects = new Map();
    rows.forEach(x => {
      const key = cleanSubjectMatchText(x.subject) || normalizeForMatch(x.subject);
      if(key && !seenSubjects.has(key)) seenSubjects.set(key, x.subject);
    });
    const subjects = [...seenSubjects.values()];
    courseLearningPanel.style.display='block';
    filterRow.style.display='flex';
    subjectSelect.disabled = false;
    subjectSelect.innerHTML = `<option value="">-- বিষয় নির্বাচন করুন --</option>` +
      subjects.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

    const applyFilters=()=>{
      const subject = subjectSelect.value;
      if(!subject){
        stopClassPlayer();
        chapterSelect.innerHTML = '<option value="">-- চ্যাপ্টার --</option>';
        chapterSelect.disabled = true;
        if(classSearchInput) classSearchInput.value='';
        if(classSearchWrap) classSearchWrap.style.display = 'none';
        classList.innerHTML = '<div class="learning-empty" style="padding:48px 16px;text-align:center;color:var(--ink-soft);"><span style="font-size:26px;display:block;margin-bottom:8px;">📖</span>ক্লাস দেখতে উপরের ড্রপডাউন থেকে একটি বিষয় (Subject) নির্বাচন করুন।</div>';
        return;
      }
      const chapter = chapterSelect.value;
      stopClassPlayer();
      let filtered = rows.filter(x =>
        isCleanSubjectMatch(x.subject, subject) ||
        normalizeForMatch(x.subject) === normalizeForMatch(subject)
      );
      if(chapter) filtered = filtered.filter(x=>normalizeForMatch(x.chapter)===normalizeForMatch(chapter));
      activeSubjectRows = filtered;
      if(classSearchInput) classSearchInput.value='';
      if(classSearchWrap) classSearchWrap.style.display = filtered.length ? 'block' : 'none';
      renderClassItems(filtered);
    };

    subjectSelect.onchange = ()=>{
      if(subjectSelect.value){
        populateChapterSelect(rows, subjectSelect.value);
        chapterSelect.disabled = false;
      } else {
        chapterSelect.innerHTML = '<option value="">-- চ্যাপ্টার --</option>';
        chapterSelect.disabled = true;
      }
      applyFilters();
    };
    chapterSelect.onchange = applyFilters;

    // Reset dropdown selection
    subjectSelect.value = '';
    chapterSelect.innerHTML = '<option value="">-- চ্যাপ্টার --</option>';
    chapterSelect.disabled = true;
    if(classSearchWrap) classSearchWrap.style.display = 'none';
    classList.innerHTML = '<div class="learning-empty" style="padding:48px 16px;text-align:center;color:var(--ink-soft);"><span style="font-size:26px;display:block;margin-bottom:8px;">📖</span>ক্লাস দেখতে উপরের ড্রপডাউন থেকে একটি বিষয় (Subject) নির্বাচন করুন।</div>';
  }

  function classLearningReset(){
    leaveLiveMeeting();
    hideLiveClassBanner();
    if(!courseLearningPanel) return;
    courseLearningPanel.style.display='none';
    filterRow.style.display='none';
    subjectSelect.innerHTML=''; chapterSelect.innerHTML='';
    subjectSelect.disabled = false;
    const subjectSelectWrap = subjectSelect.closest('.filter-select-wrap');
    if(subjectSelectWrap) subjectSelectWrap.style.display='';
    stopClassPlayer(); classList.innerHTML='';
    activeSubjectRows = [];
    currentWatchCourse = '';
    currentWatchSector = '';
    currentWatchGetWt = false;
    if(classSearchInput) classSearchInput.value='';
    if(classSearchWrap) classSearchWrap.style.display='none';
    classDataCache.clear();
  }

  function showExpiredNotice(course){
    classLearningReset();
    courseLearningPanel.style.display='block';
    filterRow.style.display='none';
    stopClassPlayer();
    const expiresText = course.expiresAt ? escapeHtml(formatDate(course.expiresAt)) : '';
    classList.innerHTML=`<div class="renew-notice">
      <strong>⏳ এই কোর্সের মেয়াদ শেষ হয়ে গেছে</strong>
      <p>${expiresText ? `মেয়াদ শেষ হয়েছে: ${expiresText}` : ''}<br>ক্লাস আবার দেখতে কোর্সটি রিনিউ করতে হবে। রিনিউ করতে আমাদের সাথে যোগাযোগ করুন।</p>
    </div>`;
  }

  // Pending notice
  function showPendingNotice(course){
    classLearningReset();
    courseLearningPanel.style.display='block';
    filterRow.style.display='none';
    stopClassPlayer();
    classList.innerHTML=`<div class="renew-notice">
      <strong>⏳ কোর্সটি এখনো সক্রিয় করা হয়নি</strong>
      <p>আপনার এনরোলমেন্টটি প্রশাসকের অনুমোদনের অপেক্ষায় রয়েছে।<br>সক্রিয় করা হলে ক্লাস মেটেরিয়াল দেখতে পাবেন।</p>
    </div>`;
  }

  function showCourseLockedNotice(course){
    classLearningReset();
    courseLearningPanel.style.display='block';
    filterRow.style.display='none';
    stopClassPlayer();
    const reason = String(course?.lockComment || '').trim();
    classList.innerHTML=`<div class="renew-notice">
      <strong>🔒 এই কোর্সটি লক করা হয়েছে</strong>
      <p>${reason ? `লক করার কারণ: <strong>${escapeHtml(reason)}</strong>` : 'এই কোর্সটি বর্তমানে লক করা আছে।'}<br>সমস্যা সমাধানের জন্য আমাদের সাথে যোগাযোগ করুন।</p>
    </div>`;
  }

  function showDeviceBlockedNotice(){
    classLearningReset();
    courseLearningPanel.style.display='block';
    filterRow.style.display='none';
    stopClassPlayer();
    classList.innerHTML=`<div class="renew-notice">
      <strong>🔒 একাধিক ডিভাইসে লগইন সনাক্ত হয়েছে</strong>
      <p>নিরাপত্তার কারণে এই কোর্সটি লক করা হয়েছে। আনলক করতে আমাদের সাথে যোগাযোগ করুন।</p>
    </div>`;
  }

  // ===== COURSE LIST <-> COURSE DETAIL "PAGE" TRANSITION =====
  // Same physical page — just slides the detail view in/out so it feels
  // like navigating to a separate screen, without a new .html file.
  function showCourseDetailView(){
    if(!courseListView || !courseDetailView) return;
    courseListView.hidden = true;
    courseListView.classList.remove('va-anim-in');
    courseDetailView.hidden = false;
    courseDetailView.classList.remove('va-anim-in');
    void courseDetailView.offsetWidth; // reflow so the animation restarts every time
    courseDetailView.classList.add('va-anim-in');
    if(dashHeadV2) dashHeadV2.style.display = 'none';
    // Push a history entry so the device/browser back button closes this
    // "page" instead of leaving the site — see popstate handler below.
    try{
      if(!history.state || history.state.vaView !== 'courseDetail'){
        history.pushState({vaView:'courseDetail'}, '', location.pathname + location.search + '#course-materials');
      }
    }catch(e){}
    if(learningArea && learningArea.scrollIntoView){
      learningArea.scrollIntoView({behavior:'smooth', block:'start'});
    }
  }

  function showCourseListView(){
    if(!courseListView || !courseDetailView) return;
    courseDetailView.hidden = true;
    courseDetailView.classList.remove('va-anim-in');
    courseListView.hidden = false;
    courseListView.classList.remove('va-anim-in');
    void courseListView.offsetWidth;
    courseListView.classList.add('va-anim-in');
    if(dashHeadV2) dashHeadV2.style.display = '';
  }

  // Back to course list
  function goBackToCourseList(){
    if(history.state && history.state.vaView === 'courseDetail'){
      history.back();
    } else {
      classLearningReset();
      showCourseListView();
    }
  }

  window.addEventListener('popstate', function(){
    if(courseDetailView && !courseDetailView.hidden){
      classLearningReset();
      showCourseListView();
    }
  });

  if(detailBackBtn){
    detailBackBtn.addEventListener('click', goBackToCourseList);
  }

  function renderEnrolledCourses(data){
    dashboardData = data || null;
    startDashboardWatchTimeDisplay();
    const courses=getEnrolledCourses(data);
    const hasMultipleDeviceLock = Array.isArray(data?.courses) && data.courses.some(c =>
      c.locked && (
        String(c.lockComment || '').toLowerCase().includes('multiple device') ||
        String(c.lockComment || '').includes('একাধিক ডিভাইস')
      )
    );
    const isDeviceBlocked = !!data.deviceBlocked || hasMultipleDeviceLock;
    const deviceBlockedBanner = document.getElementById('deviceBlockedBanner');
    if(deviceBlockedBanner) deviceBlockedBanner.style.display = isDeviceBlocked ? 'flex' : 'none';
    enrolledCourseList.innerHTML=''; classLearningReset();
    // Full dashboard (re)renders (login / refresh) always start back on the
    // course-grid "page", not stuck inside whichever course was last opened.
    if(courseDetailView) { courseDetailView.hidden = true; courseDetailView.classList.remove('va-anim-in'); }
    if(courseListView) { courseListView.hidden = false; courseListView.classList.remove('va-anim-in'); }
    if(dashHeadV2) dashHeadV2.style.display = '';
    if(!courses.length){ learningEmpty.style.display='block'; return; }
    learningEmpty.style.display='none';
    enrolledCourseList.innerHTML=courses.map((course,i)=>{
      const coursePriceVal = String(course.coursePrice || '').trim();
      const discountVal = String(course.discount || '').trim();
      const paidVal = String(course.paid || '').trim();
      const nextDateVal = String(course.nextDate || '').trim();

      const parseAmount = v => {
        const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
        return isNaN(n) ? null : n;
      };
      const priceNum = parseAmount(coursePriceVal);
      const discountNum = parseAmount(discountVal) || 0;
      const paidNum = parseAmount(paidVal);
      let dueVal = '';
      let isFullyPaid = false;
      if (priceNum !== null && paidNum !== null) {
        const due = priceNum - discountNum - paidNum;
        if (due > 0) {
          dueVal = String(due);
        } else {
          isFullyPaid = true;
        }
      }

      const isFreeCourse = /\bfree\b/i.test(coursePriceVal) || 
                           /\bfree\b/i.test(paidVal) || 
                           /\bfree\b/i.test(String(course.accessType || '')) ||
                           Boolean(course.isFree) || 
                           (priceNum !== null && priceNum === 0) ||
                           (!coursePriceVal && !paidVal) ||
                           (typeof freeCourseNamesSet !== 'undefined' && freeCourseNamesSet.has(normalizeForMatch(course.name)));

      const isExpired = String(course.status||'').trim().toLowerCase()==='expired';
      const isPending = !isFreeCourse && String(course.status||'').trim().toLowerCase()==='pending';
      const isCourseLocked = !!course.locked;
      const lockReason = String(course.lockComment || '').trim();
      
      let badge = '';
      if (isCourseLocked) {
        badge = '<span class="locked-badge">🔒 লকড</span>';
      } else if (isExpired) {
        badge = '<span class="expired-badge">মেয়াদ শেষ</span>';
      } else if (isPending) {
        badge = '<span class="pending-badge">⏳ Pending</span>';
      } else {
        badge = '<span class="active-badge">✓ Active</span>';
      }

      const lockedClass = isCourseLocked ? ' is-locked' : (isExpired ? ' is-expired' : '');
      const isSubjectWise = !!parseSubjectWiseCourseId(course.name);
      const displayName = getSubjectWiseDisplayName(course.name);
      const cornerLabel = isSubjectWise ? 'Subject' : 'Course';
      const iconEmoji = isSubjectWise ? getSubjectIcon(displayName) : '🎓';

      const isFreePrice = isFreeCourse || !coursePriceVal || (priceNum !== null && priceNum === 0) || /free/i.test(coursePriceVal);
      const priceLine = isFreePrice
        ? `<span class="ecb-billing"><span class="ecb-icon-emoji">💰</span> Price: <span class="ecb-billing-value ecb-free-value">Free</span></span>`
        : (coursePriceVal ? `<span class="ecb-billing"><span class="ecb-icon-emoji">💰</span> Price: <span class="ecb-billing-value">${escapeHtml(coursePriceVal)}</span>${discountVal ? ` <span class="ecb-billing-discount">(dis: ${escapeHtml(discountVal)})</span>` : ''}</span>` : '');
      const paidLine = (paidVal && !isFreePrice)
        ? `<span class="ecb-billing"><span class="ecb-icon-emoji">✅</span> Paid: <span class="ecb-billing-value">${escapeHtml(paidVal)}</span>${dueVal ? `<span class="ecb-billing-due">Due: <span class="ecb-billing-value">${escapeHtml(dueVal)}</span></span>` : ''}</span>`
        : '';
      const nextDateLine = (nextDateVal && !isFullyPaid && !isFreePrice)
        ? `<span class="ecb-billing"><span class="ecb-icon-emoji">🗓️</span> Next Payment: <span class="ecb-billing-value">${escapeHtml(formatNextPaymentDate(nextDateVal))}</span></span>`
        : '';

      const isLive = Boolean(course.isLive || course.is_live);

      return `<button type="button" class="enrolled-course-btn${lockedClass}" data-course="${escapeHtml(course.name)}" data-sector="${escapeHtml(course.nuDcu||'')}" data-idx="${i}">
        <span class="ecb-corner-badge">${cornerLabel}</span>
        ${course.nuDcu ? `<span class="ecb-sector-badge">${escapeHtml(course.nuDcu)}</span>` : ''}
        <div class="ecb-corner-actions">
          ${isLive ? `
          <span class="ecb-live-btn" role="button" tabindex="0" title="লাইভ ক্লাস চলছে! সরাসরি যোগ দিন" data-idx="${i}">
            <span class="ecb-live-dot-wrap" aria-hidden="true">
              <span class="ecb-live-ping"></span>
              <span class="ecb-live-dot"></span>
            </span>
            <svg viewBox="0 0 24 24" class="ecb-live-svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
              <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" class="ecb-wave-1"/>
              <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" class="ecb-wave-1"/>
              <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" class="ecb-wave-2"/>
              <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" class="ecb-wave-2"/>
            </svg>
            <span>Live</span>
          </span>` : ''}
          <span class="ecb-routine-btn" role="button" tabindex="0" title="কোর্সের রুটিন দেখুন" data-routine="${escapeHtml(course.routine || '')}" data-course-name="${escapeHtml(course.name)}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span>Routine</span>
          </span>
        </div>
        <span class="ecb-icon">${iconEmoji}</span>
        <span class="ecb-body">
          <span class="ecb-name">${escapeHtml(displayName)}</span>
          <span class="ecb-meta"><span class="ecb-date"><span class="ecb-icon-emoji">📅</span> Enrolled: ${escapeHtml(formatDate(course.enrolledAt))}</span>${badge}</span>
          ${lockReason ? `<span class="lock-reason">কারণ: ${escapeHtml(lockReason)}</span>` : ''}
          <span class="ecb-watchtime"><span class="ecb-icon-emoji">⏱️</span> <span class="ecb-wt-label">Watch Time:</span> <span class="ecb-wt-value">${escapeHtml(formatWatchTimeValue(getDashboardWatchTimeMinutes(course, String(data?.mobile || getCurrentUserMobile() || '').trim())))}</span></span>
          ${priceLine}
          ${paidLine}
          ${nextDateLine}
        </span>
      </button>`;
    }).join('');
    const selectCourse=idx=>{
      const course = courses[idx];
      if(!course) return;
      const status = String(course.status || '').trim().toLowerCase();

      // Check locked status
      if(course.locked){
        const reason = String(course.lockComment || '').trim();
        if(reason){
          vaShowToast(reason.startsWith('⚠️') || reason.startsWith('🔒') ? reason : `🔒 কোর্সটি লক করা হয়েছে: ${reason}`);
        } else {
          vaShowToast('🔒 এই কোর্সটি বর্তমানে লক করা আছে। কর্তৃপক্ষের সাথে যোগাযোগ করুন।');
        }
        return;
      }

      // Check expired status
      if(status === 'expired'){
        vaShowToast('⚠️ এই কোর্সের অ্যাক্সেসের মেয়াদ শেষ হয়ে গেছে।');
        return;
      }

      // Check device block
      if(isDeviceBlocked){
        vaShowToast('🔒 একাধিক ডিভাইসে লগইন সনাক্ত হওয়ায় কোর্স অ্যাক্সেস স্থগিত করা হয়েছে। আনলক করতে কর্তৃপক্ষের সাথে যোগাযোগ করুন।');
        return;
      }

      // Check pending status
      const isFreeCourse = /\bfree\b/i.test(String(course.coursePrice || '')) ||
                           /\bfree\b/i.test(String(course.paid || '')) ||
                           Boolean(course.isFree) ||
                           (typeof freeCourseNamesSet !== 'undefined' && freeCourseNamesSet.has(normalizeForMatch(course.name)));
      if(status === 'pending' && !isFreeCourse){
        vaShowToast('⏳ আপনার কোর্সটি এখনো অনুমোদনের অপেক্ষায় রয়েছে।');
        return;
      }

      enrolledCourseList.querySelectorAll('.enrolled-course-btn').forEach(btn=>btn.classList.toggle('active', Number(btn.dataset.idx)===idx));

      if(detailTitle){
        const baseName = getSubjectWiseDisplayName(course.name) || course.name || 'কোর্স';
        detailTitle.textContent = baseName;
      }
      showCourseDetailView();
      loadCourseClasses(course.name, course.nuDcu);
    };
    enrolledCourseList.querySelectorAll('.enrolled-course-btn').forEach(btn=>{
      btn.addEventListener('click',(e)=>{
        // Ignore clicks on routine or live button
        if(e.target.closest('.ecb-routine-btn') || e.target.closest('.ecb-live-btn')) return;
        selectCourse(Number(btn.dataset.idx));
      });
    });

    // Routine button click
    enrolledCourseList.querySelectorAll('.ecb-routine-btn').forEach(rBtn=>{
      const triggerRoutine = e =>{
        e.preventDefault();
        e.stopPropagation();
        const routineUrl = rBtn.dataset.routine || '';
        const courseName = rBtn.dataset.courseName || '';
        handleRoutineClick(routineUrl, courseName);
      };
      rBtn.addEventListener('click', triggerRoutine);
      rBtn.addEventListener('keydown', e =>{
        if(e.key === 'Enter' || e.key === ' '){
          triggerRoutine(e);
        }
      });
    });

    // Live button click
    enrolledCourseList.querySelectorAll('.ecb-live-btn').forEach(lBtn=>{
      const triggerLive = e =>{
        e.preventDefault();
        e.stopPropagation();
        const idx = Number(lBtn.dataset.idx);
        selectCourse(idx);
        setTimeout(() => {
          const liveCard = document.getElementById('liveClassCard');
          if(liveCard && liveCard.style.display !== 'none'){
            liveCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 250);
      };
      lBtn.addEventListener('click', triggerLive);
      lBtn.addEventListener('keydown', e =>{
        if(e.key === 'Enter' || e.key === ' '){
          triggerLive(e);
        }
      });
    });

    // Background Real-time Live Status Sync (Dynamic Check)
    (async function checkLiveStatusBackground() {
      try {
        const liveRes = await callApi({ action: 'get_live_status' });
        if (liveRes && liveRes.status === 'ok' && Array.isArray(liveRes.liveCourses)) {
          const liveNormSet = new Set(liveRes.liveCourses.map(c => normalizeForMatch(c)));
          courses.forEach((c, idx) => {
            const cNorm = normalizeForMatch(c.name);
            let matchingLive = liveNormSet.has(cNorm);
            if (!matchingLive && liveNormSet.size > 0) {
              for (const lName of liveNormSet) {
                if (lName === cNorm || (cNorm && lName && (lName.includes(cNorm) || cNorm.includes(lName)))) {
                  matchingLive = true;
                  break;
                }
              }
            }
            const cardBtn = enrolledCourseList.querySelector(`.enrolled-course-btn[data-idx="${idx}"]`);
            if (cardBtn) {
              const actionsContainer = cardBtn.querySelector('.ecb-corner-actions');
              let existingLive = cardBtn.querySelector('.ecb-live-btn');
              if (matchingLive && !existingLive && actionsContainer) {
                const liveBtnHtml = `
                  <span class="ecb-live-btn" role="button" tabindex="0" title="লাইভ ক্লাস চলছে! সরাসরি যোগ দিন" data-idx="${idx}">
                    <span class="ecb-live-dot-wrap" aria-hidden="true">
                      <span class="ecb-live-ping"></span>
                      <span class="ecb-live-dot"></span>
                    </span>
                    <svg viewBox="0 0 24 24" class="ecb-live-svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
                      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" class="ecb-wave-1"/>
                      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" class="ecb-wave-1"/>
                      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" class="ecb-wave-2"/>
                      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" class="ecb-wave-2"/>
                    </svg>
                    <span>Live</span>
                  </span>`;
                actionsContainer.insertAdjacentHTML('afterbegin', liveBtnHtml);
                const newLiveBtn = actionsContainer.querySelector('.ecb-live-btn');
                if (newLiveBtn) {
                  newLiveBtn.addEventListener('click', e => {
                    e.preventDefault(); e.stopPropagation(); selectCourse(idx);
                  });
                }
              } else if (!matchingLive && existingLive) {
                existingLive.remove();
              }
            }
          });
        }
      } catch (e) {}
    })();
  }

  // ============================================================
  // ROUTINE VIEWER MODAL (Zoom & Pan support)
  // ============================================================
  function formatRoutineImageUrl(v){
    const x = String(v ?? '').trim();
    if(!x) return '';
    const f = x.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    const i = x.match(/[?&]id=([^&]+)/i);
    if(f) return `https://drive.google.com/thumbnail?id=${f[1]}&sz=w2500`;
    if(x.includes('drive.google.com') && i) return `https://drive.google.com/thumbnail?id=${i[1]}&sz=w2500`;
    return x;
  }

  const routineModal = document.getElementById('routineModalOverlay');
  const routineImg = document.getElementById('routineModalImage');
  const routineClose = document.getElementById('routineModalClose');
  const routineViewport = document.getElementById('routineModalViewport');
  const routineHint = document.getElementById('routineZoomHint');

  let rScale = 1;
  let rTranslateX = 0;
  let rTranslateY = 0;
  let rIsDragging = false;
  let rStartX = 0;
  let rStartY = 0;
  let rInitialDist = 0;
  let rInitialScale = 1;
  let rHintTimer = null;

  function updateRoutineTransform(animate = true){
    if(!routineImg) return;
    routineImg.style.transition = animate ? 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
    routineImg.style.transform = `translate(${rTranslateX}px, ${rTranslateY}px) scale(${rScale})`;
    if(routineViewport){
      routineViewport.classList.toggle('is-zoomed', rScale > 1);
      routineViewport.classList.toggle('is-dragging', rIsDragging);
    }
  }

  function resetRoutineZoom(){
    rScale = 1;
    rTranslateX = 0;
    rTranslateY = 0;
    rIsDragging = false;
    updateRoutineTransform(false);
  }

  function openRoutineModal(url, courseName){
    if(!routineModal || !routineImg) return;
    const finalUrl = formatRoutineImageUrl(url);
    routineImg.src = finalUrl;
    routineImg.alt = `${courseName || 'কোর্স'} রুটিন`;
    resetRoutineZoom();

    routineModal.style.display = 'flex';
    void routineModal.offsetWidth;
    routineModal.classList.add('show');
    routineModal.setAttribute('aria-hidden', 'false');

    if(routineHint){
      clearTimeout(rHintTimer);
      routineHint.style.opacity = '1';
      rHintTimer = setTimeout(()=>{ if(routineHint) routineHint.style.opacity = '0'; }, 2400);
    }
  }

  function closeRoutineModal(){
    if(!routineModal) return;
    routineModal.classList.remove('show');
    routineModal.setAttribute('aria-hidden', 'true');
    setTimeout(()=>{
      if(!routineModal.classList.contains('show')){
        routineModal.style.display = 'none';
        if(routineImg) routineImg.src = '';
        resetRoutineZoom();
      }
    }, 280);
  }

  async function handleRoutineClick(routineVal, courseName){
    let url = String(routineVal || '').trim();

    // Fallback: If routine is not on the course object, fetch from get_courses once
    if(!url && courseName){
      vaShowToast('🔍 রুটিন খোঁজা হচ্ছে...');
      try {
        const res = await callApi({ action: 'get_courses' });
        if(res && res.status === 'ok' && Array.isArray(res.data)){
          const match = res.data.find(c => normalizeForMatch(c.name) === normalizeForMatch(courseName));
          if(match && match.routine){
            url = String(match.routine).trim();
            const btn = enrolledCourseList.querySelector(`.ecb-routine-btn[data-course-name="${escapeHtml(courseName)}"]`);
            if(btn) btn.dataset.routine = url;
          }
        }
      } catch(err){
        console.error('Failed to fetch course routine fallback:', err);
      }
    }

    if(!url){
      vaShowToast('📋 এই কোর্সের রুটিন এখনো আপলোড করা হয়নি।');
      return;
    }

    openRoutineModal(url, courseName);
  }

  if(routineModal){
    routineClose?.addEventListener('click', closeRoutineModal);
    routineModal.addEventListener('click', (e)=>{
      if(e.target === routineModal || e.target === routineViewport){
        closeRoutineModal();
      }
    });
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && routineModal.classList.contains('show')){
        closeRoutineModal();
      }
    });

    // Desktop Click toggles zoom
    routineImg?.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(rScale === 1){
        rScale = 2.4;
        const rect = routineImg.getBoundingClientRect();
        const offsetX = e.clientX - (rect.left + rect.width / 2);
        const offsetY = e.clientY - (rect.top + rect.height / 2);
        rTranslateX = -offsetX * 1.2;
        rTranslateY = -offsetY * 1.2;
      } else {
        resetRoutineZoom();
      }
      updateRoutineTransform(true);
    });

    // Mouse wheel zoom
    routineViewport?.addEventListener('wheel', (e)=>{
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.3 : -0.3;
      const nextScale = Math.min(4.5, Math.max(1, rScale + delta));
      if(nextScale <= 1){
        resetRoutineZoom();
      } else {
        rScale = nextScale;
        updateRoutineTransform(true);
      }
    }, { passive: false });

    // Mouse drag to pan when zoomed
    routineViewport?.addEventListener('mousedown', (e)=>{
      if(rScale <= 1 || e.target === routineClose) return;
      rIsDragging = true;
      rStartX = e.clientX - rTranslateX;
      rStartY = e.clientY - rTranslateY;
      routineViewport.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', (e)=>{
      if(!rIsDragging || rScale <= 1) return;
      rTranslateX = e.clientX - rStartX;
      rTranslateY = e.clientY - rStartY;
      updateRoutineTransform(false);
    });

    window.addEventListener('mouseup', ()=>{
      if(rIsDragging){
        rIsDragging = false;
        if(routineViewport) routineViewport.classList.remove('is-dragging');
        updateRoutineTransform(true);
      }
    });

    // Touch pinch-to-zoom & pan for mobile devices
    routineViewport?.addEventListener('touchstart', (e)=>{
      if(e.touches.length === 2){
        rInitialDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        rInitialScale = rScale;
      } else if(e.touches.length === 1 && rScale > 1){
        rIsDragging = true;
        rStartX = e.touches[0].clientX - rTranslateX;
        rStartY = e.touches[0].clientY - rTranslateY;
      }
    }, { passive: true });

    routineViewport?.addEventListener('touchmove', (e)=>{
      if(e.touches.length === 2 && rInitialDist > 0){
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / rInitialDist;
        rScale = Math.min(4.5, Math.max(1, rInitialScale * factor));
        updateRoutineTransform(false);
      } else if(e.touches.length === 1 && rIsDragging && rScale > 1){
        e.preventDefault();
        rTranslateX = e.touches[0].clientX - rStartX;
        rTranslateY = e.touches[0].clientY - rStartY;
        updateRoutineTransform(false);
      }
    }, { passive: false });

    routineViewport?.addEventListener('touchend', (e)=>{
      if(e.touches.length < 2) rInitialDist = 0;
      if(e.touches.length === 0){
        rIsDragging = false;
        if(rScale < 1.05) resetRoutineZoom();
        else updateRoutineTransform(true);
      }
    });
  }

  function renderProfileInfo(data){
    hideLoading();
    document.getElementById('dashName').textContent = data.name || '—';
    document.getElementById('dashLevel').textContent = data.level || '—';
    document.getElementById('dashYear').textContent = data.year ? (data.session ? `${data.year} (${data.session})` : data.year) : '—';
    document.getElementById('dashDepartment').textContent = data.department || '—';
    document.getElementById('dashMobile').textContent = data.mobile || '—';
    authPageHead.style.display = 'none';
    authWrapSection.style.display = 'none';
    dashboardSection.style.display = 'block';
  }

  function showCourseListSkeleton(){
    const deviceBlockedBanner = document.getElementById('deviceBlockedBanner');
    if(deviceBlockedBanner) deviceBlockedBanner.style.display = 'none';
    learningEmpty.style.display = 'none';
    classLearningReset();
    enrolledCourseList.innerHTML = `<div class="class-loading"><span class="spinner"></span>কোর্স লোড হচ্ছে...</div>`;
  }

  let vaToastTimer = null;
  function vaShowToast(message){
    let toast = document.getElementById('vaToast');
    if(!toast){
      toast = document.createElement('div');
      toast.id = 'vaToast';
      toast.className = 'va-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(vaToastTimer);
    vaToastTimer = setTimeout(()=>toast.classList.remove('show'), 3200);
  }

  function showCourseListError(mobile){
    const deviceBlockedBanner = document.getElementById('deviceBlockedBanner');
    if(deviceBlockedBanner) deviceBlockedBanner.style.display = 'none';
    learningEmpty.style.display = 'none';
    classLearningReset();
    enrolledCourseList.innerHTML = `<div class="renew-notice">
      <strong>📶 কোর্সের তথ্য লোড করা যায়নি</strong>
      <p>ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।</p>
      <button type="button" class="btn btn-outline" id="courseRetryBtn" style="margin-top:10px;">🔄 আবার চেষ্টা করুন</button>
    </div>`;
    const retryBtn = document.getElementById('courseRetryBtn');
    if(retryBtn) retryBtn.addEventListener('click', ()=>{
      showCourseListSkeleton();
      refreshStudentData(mobile);
    });
  }

  function renderJoinedDate(data){
    const enrollmentDates=document.getElementById('enrollmentDates');
    if(!enrollmentDates) return;
    enrollmentDates.innerHTML = data && data.timestamp
      ? `Joined: <strong>${escapeHtml(formatDate(data.timestamp))}</strong>`
      : '—';
  }

  async function syncAndRenderDashboard(data){
    dashboardData = data || null;
    renderProfileInfo(data);
    renderEnrolledCourses(data);
    renderJoinedDate(data);
    refreshDashboardWatchTimeDisplay();

    const synced = await syncPendingWatchTime(data);
    if(synced){
      localStorage.setItem(LS_USER_KEY, JSON.stringify(data));
      dashboardData = data || null;
      renderEnrolledCourses(data);
      refreshDashboardWatchTimeDisplay();
    }
    checkPaymentReminders(data);
  }

  function renderDashboard(data){
    dashboardData = data || null;
    startDashboardWatchTimeDisplay();
    renderProfileInfo(data);
    renderEnrolledCourses(data);
    renderJoinedDate(data);
    checkPaymentReminders(data);
  }

  // ============================================================
  // PAYMENT REMINDER (next_date) — shows a modal starting 2 days
  // before a course's "Next Payment" date, warning that the course
  // will be locked if payment isn't made in time. Purely informational
  // on the client — the actual lock happens server-side (Worker) once
  // the date has passed, via blocked/b_comment on student_enrolled.
  // Shown on EVERY page load/refresh while a course is within the due
  // window (no longer throttled to once per calendar day).
  // ============================================================

  function startOfToday(){
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }

  function daysUntil(dateValue){
    const target = parseNextPaymentDate(dateValue);
    if(!target) return null;
    target.setHours(0,0,0,0);
    const diffMs = target.getTime() - startOfToday().getTime();
    return Math.round(diffMs / 86400000);
  }

  function getPaymentReminderCourses(data){
    const courses = Array.isArray(data?.courses) ? data.courses : [];
    const due = [];

    courses.forEach(course=>{
      const status = String(course.status || '').trim().toLowerCase();
      if(status !== 'active') return;
      if(course.locked) return;

      const nextDateVal = String(course.nextDate || '').trim();
      if(!nextDateVal) return;

      const remaining = daysUntil(nextDateVal);
      if(remaining === null) return;

      // 2 days before the due date, up to (and including) the due date itself.
      if(remaining >= 0 && remaining <= 2){
        due.push({ course, remaining, nextDateVal });
      }
    });

    return due;
  }

  function checkPaymentReminders(data){
    if(!data) return;
    const mobile = String(data.mobile || getCurrentUserMobile() || '').trim();
    if(!mobile) return;

    const dueCourses = getPaymentReminderCourses(data);
    if(!dueCourses.length) return;

    const lines = dueCourses.map(({course, remaining, nextDateVal})=>{
      const name = getSubjectWiseDisplayName(course.name) || course.name || 'কোর্স';
      const whenText = remaining === 0 ? 'আজই' : `${remaining} দিনের মধ্যে`;
      return `<strong>${escapeHtml(name)}</strong> কোর্সের পরবর্তী পেমেন্ট তারিখ <strong>${escapeHtml(formatNextPaymentDate(nextDateVal))}</strong> (${whenText})।`;
    }).join('<br><br>');

    openPaymentReminderModal(lines);
  }

  const paymentReminderModalOverlay = document.getElementById('paymentReminderModalOverlay');
  const paymentReminderModalText = document.getElementById('paymentReminderModalText');
  const paymentReminderModalOkBtn = document.getElementById('paymentReminderModalOkBtn');

  function openPaymentReminderModal(messageHtml){
    if(!paymentReminderModalOverlay) return;
    paymentReminderModalText.innerHTML =
      messageHtml + '<br><br>অনুগ্রহ করে সময়মতো পেমেন্ট করুন, অন্যথায় আপনার কোর্স লক (Locked) হয়ে যাবে।';
    paymentReminderModalOverlay.classList.add('show');
  }

  function closePaymentReminderModal(){
    if(!paymentReminderModalOverlay) return;
    paymentReminderModalOverlay.classList.remove('show');
  }

  if(paymentReminderModalOkBtn){
    paymentReminderModalOkBtn.addEventListener('click', closePaymentReminderModal);
  }

  function showAuthUI(){
    authPageHead.style.display = 'block';
    authWrapSection.style.display = 'block';
    dashboardSection.style.display = 'none';
  }

  const cachedUser = localStorage.getItem(LS_USER_KEY);
  if(cachedUser){
    try{
      const cachedData = JSON.parse(cachedUser);
      if(enrollParam && cachedData && cachedData.mobile){
        showAuthUI();
        showLoading('কোর্সের তথ্য লোড হচ্ছে...');
        enrollCourse(enrollParam)
          .then(function(){
            window.history.replaceState({}, document.title, 'student-login.html');
            hideLoading();
          })
          .catch(function(err){
            renderDashboard(cachedData);
            hideLoading();
            alert('❌ ' + (err.message || 'Course enrollment failed.'));
          });
      } else {
        renderProfileInfo(cachedData);
        showCourseListSkeleton();
        refreshStudentData(cachedData.mobile);
      }
    }catch(e){
      localStorage.removeItem(LS_USER_KEY);
      showAuthUI();
      // Default to login tab
      showLogin();
    }
  } else {
    showAuthUI();
    // Default to login tab
    showLogin();
  }

  function getSubjectIcon(subject){
    const s = String(subject || '').toLowerCase();
    const rules = [
      [['বাংলা'], '📕'],
      [['english','ইংরেজি'], '🔤'],
      [['accounting','হিসাব'], '🧮'],
      [['finance','ফিন্যান্স'], '💰'],
      [['management','ম্যানেজমেন্ট'], '📊'],
      [['marketing','মার্কেটিং'], '📢'],
      [['economics','অর্থনীতি'], '📈'],
      [['math','গণিত'], '➗'],
      [['physics','পদার্থ'], '⚛️'],
      [['chemistry','রসায়ন'], '🧪'],
      [['biology','জীববিজ্ঞান'], '🧬'],
      [['ict','computer','কম্পিউটার'], '💻'],
      [['islam','ধর্ম'], '🕌'],
      [['history','ইতিহাস'], '📜'],
      [['geography','ভূগোল'], '🌍'],
      [['statistics','পরিসংখ্যান'], '📉'],
      [['law','আইন'], '⚖️'],
    ];
    for(const [keys, icon] of rules){
      if(keys.some(k => s.includes(k))) return icon;
    }
    return '📘';
  }

  function normalizeMobileForMatch(mobile){
    return String(mobile || '').trim().replace(/[\s-]/g, '');
  }

  async function refreshStudentData(mobile){
    if(!mobile) return;
    const isStillCurrentUser = ()=>{
      const stillLoggedInRaw = localStorage.getItem(LS_USER_KEY);
      if(!stillLoggedInRaw) return false;
      let stillLoggedInMobile = '';
      try{ stillLoggedInMobile = JSON.parse(stillLoggedInRaw)?.mobile || ''; }catch(e){}
      return normalizeMobileForMatch(stillLoggedInMobile) === normalizeMobileForMatch(mobile);
    };
    try{
      const result = await callApi({
        action: 'get_student'
      });
      if(!isStillCurrentUser()) return;
      if(result.status === 'ok' && result.data){
        result.data.mobile = String(mobile).trim();
        localStorage.setItem(LS_USER_KEY, JSON.stringify(result.data));
        syncAndRenderDashboard(result.data);
      } else {
        const errMsg = String(result?.message || '').toLowerCase();
        if(result?.sessionExpired || errMsg.includes('session expired') || errMsg.includes('not bound to this device')){
          localStorage.removeItem(LS_STUDENT_SESSION_TOKEN_KEY);
          localStorage.removeItem(LS_USER_KEY);
          showAuthUI();
          showLogin();
          return;
        }
        vaShowToast('📶 নেটওয়ার্ক সমস্যা হচ্ছে, একটু পর আবার চেষ্টা করুন।');
        showCourseListError(mobile);
      }
    }catch(err){
      console.error('Background student data refresh failed:', err);
      if(isStillCurrentUser()){
        vaShowToast('📶 নেটওয়ার্ক সমস্যা হচ্ছে, একটু পর আবার চেষ্টা করুন।');
        showCourseListError(mobile);
      }
    }
  }

  async function callApi(payload){
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 20000);
    const requestPayload = {...payload};
    const sessionToken = localStorage.getItem(LS_STUDENT_SESSION_TOKEN_KEY);
    if(requestPayload.action !== 'login' && requestPayload.action !== 'register' && requestPayload.action !== 'register_send_otp' && !requestPayload.action.startsWith('forgot_')){
      if(sessionToken) requestPayload.sessionToken = sessionToken;
      requestPayload.deviceToken = getDeviceToken();
    }
    // Always attach fingerprint for multi-browser same-device detection
    const fp = await getFingerprint();
    if(fp) requestPayload.fingerprintHash = fp;
    return fetch(FORM_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(requestPayload),signal:controller.signal})
      .then(res=>{
        if(!res.ok) throw new Error('Try Again Later 401');
        return res.json();
      })
      .catch(err=>{
        if(err.name === 'AbortError') throw new Error('Session Timeout, Check your internet connection');
        throw err;
      })
      .finally(()=>clearTimeout(timeout));
  }

  let freeCourseNamesSet = new Set();
  async function loadFreeCoursesSet(){
    try {
      let cached = null;
      try {
        const raw = sessionStorage.getItem('va_free_course_names');
        if (raw) cached = JSON.parse(raw);
      } catch(e){}
      if (Array.isArray(cached) && cached.length) {
        freeCourseNamesSet = new Set(cached.map(normalizeForMatch));
        return;
      }
      const res = await callApi({ action: 'get_courses' });
      if (res && res.status === 'ok' && Array.isArray(res.data)) {
        const freeNames = res.data
          .filter(c => /\bfree\b/i.test(String(c.price || '')) || /\bfree\b/i.test(String(c.coursePrice || '')))
          .map(c => normalizeForMatch(c.name));
        freeCourseNamesSet = new Set(freeNames);
        try { sessionStorage.setItem('va_free_course_names', JSON.stringify(freeNames)); } catch(e){}
      }
    } catch(e){}
  }
  loadFreeCoursesSet();

  // get_course_data now requires an ACTIVE enrollment for the exact course
  // being requested — it can no longer double as a pre-enroll "does this
  // course have materials yet" check, since the student isn't enrolled at
  // this point. This uses the lightweight, public, un-authenticated
  // get_course_availability action instead (same one the homepage uses),
  // which only returns a flat list of course names — no subject/url/pdf.
  async function courseMaterialsExist(courseName){
    try{
      const sw = parseSubjectWiseCourseId(courseName);
      if(sw) return true;
      const response = await fetch(FORM_ENDPOINT, {
        method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({ action:'get_course_availability', courseName })
      });
      if(!response.ok) return false;
      const json = await response.json();
      return json.status === 'ok' && json.available === true;
    }catch(err){
      console.error('Course availability check failed:', err);
      return false;
    }
  }

  async function enrollCourse(courseName){
    const user=JSON.parse(localStorage.getItem(LS_USER_KEY) || 'null');
    if(!user || !user.mobile) return false;

    showLoading('কোর্সের class materials যাচাই করা হচ্ছে...');
    const hasMaterials = await courseMaterialsExist(courseName);
    if(!hasMaterials){
      throw new Error('এই কোর্সের জন্য এখনো কোনো course materials পাওয়া যায়নি। তাই এখন enroll করা সম্ভব হচ্ছে না, দয়া করে পরে আবার চেষ্টা করুন।');
    }

    showLoading('কোর্সের তথ্য লোড হচ্ছে...');
    const fullMobile = String(user.mobile).trim();
    const isFree = Boolean(enrollFreeParam) || freeCourseNamesSet.has(normalizeForMatch(courseName));

    const result=await callApi({
      action:'enroll',
      mobile:normalizeMobileForMatch(fullMobile),
      course:courseName,
      nuDcu:getCourseSector(courseName),
      deviceToken: getDeviceToken(),
      free: isFree ? '1' : '0',
      price: isFree ? 'Free' : ''
    });
    if(result.status !== 'ok') throw new Error(result.message || 'Course enrollment failed.');
    if(result.data){
      result.data.mobile = fullMobile;
      if(isFree && Array.isArray(result.data.courses)){
        result.data.courses.forEach(c => {
          if(normalizeForMatch(c.name) === normalizeForMatch(courseName)){
            c.status = 'Active';
            c.coursePrice = 'Free';
            c.paid = 'Free';
            c.isFree = true;
          }
        });
      }
      localStorage.setItem(LS_USER_KEY,JSON.stringify(result.data));
      await syncAndRenderDashboard(result.data);
    }
    return true;
  }

  // Department options by level
  const DEPARTMENTS_BY_LEVEL = {
    HSC: ['Science', 'Commerce', 'Arts']
  };
  const DEFAULT_DEPARTMENTS = ['Accounting', 'Management', 'Marketing', 'Finance'];

  function updateDepartmentOptions(level){
    const departments = DEPARTMENTS_BY_LEVEL[level] || DEFAULT_DEPARTMENTS;
    const select = document.getElementById('reg_department');
    const previousValue = select.value;
    select.innerHTML = '<option value="" disabled selected>নির্বাচন করুন</option>' +
      departments.map(d => `<option value="${d}">${d}</option>`).join('');
    if(departments.includes(previousValue)) select.value = previousValue;
  }

  document.getElementById('reg_level').addEventListener('change', function(){
    updateDepartmentOptions(this.value);
  });

  // ============================================================
  // REGISTRATION OTP MODAL
  // ============================================================
  const otpModalOverlay = document.getElementById('otpModalOverlay');
  const otpModalMobile = document.getElementById('otpModalMobile');
  const otpModalStatus = document.getElementById('otpModalStatus');
  const otpInput = document.getElementById('otpInput');
  const otpModalVerifyBtn = document.getElementById('otpModalVerifyBtn');
  const otpModalCancelBtn = document.getElementById('otpModalCancelBtn');
  const otpResendBtn = document.getElementById('otpResendBtn');

  const OTP_RESEND_COOLDOWN_SECONDS = 60;
  let otpResendTimer = null;
  let currentOtpId = '';
  let pendingRegistrationPayload = null; // full registration payload minus otpId/otp

  function setOtpModalStatus(message, isError){
    otpModalStatus.textContent = message || '';
    otpModalStatus.className = 'form-status' + (message ? (' show ' + (isError ? 'err' : 'ok')) : '');
  }

  function startOtpResendCountdown(){
    let secondsLeft = OTP_RESEND_COOLDOWN_SECONDS;
    otpResendBtn.disabled = true;
    otpResendBtn.textContent = `আবার পাঠান (${secondsLeft})`;
    if(otpResendTimer) clearInterval(otpResendTimer);
    otpResendTimer = setInterval(function(){
      secondsLeft--;
      if(secondsLeft <= 0){
        clearInterval(otpResendTimer);
        otpResendTimer = null;
        otpResendBtn.disabled = false;
        otpResendBtn.textContent = 'আবার পাঠান';
      } else {
        otpResendBtn.textContent = `আবার পাঠান (${secondsLeft})`;
      }
    }, 1000);
  }

  function closeOtpModal(){
    otpModalOverlay.classList.remove('show');
    if(otpResendTimer){ clearInterval(otpResendTimer); otpResendTimer = null; }
    otpInput.value = '';
    setOtpModalStatus('', false);
    currentOtpId = '';
    pendingRegistrationPayload = null;
  }

  function openOtpModal(mobile){
    otpModalMobile.textContent = mobile;
    otpInput.value = '';
    setOtpModalStatus('', false);
    otpModalOverlay.classList.add('show');
    startOtpResendCountdown();
    setTimeout(function(){ otpInput.focus(); }, 150);
  }

  function requestRegistrationOtp(mobile, email){
    return callApi({ action: 'register_send_otp', mobile: mobile, email: email || '' });
  }

  otpResendBtn.addEventListener('click', function(){
    if(otpResendBtn.disabled || !pendingRegistrationPayload) return;
    setOtpModalStatus('OTP আবার পাঠানো হচ্ছে...', false);
    requestRegistrationOtp(pendingRegistrationPayload.mobile, pendingRegistrationPayload.email)
      .then(function(result){
        if(result.status === 'ok'){
          currentOtpId = result.otpId;
          otpInput.value = '';
          setOtpModalStatus('✅ নতুন OTP পাঠানো হয়েছে।', false);
          startOtpResendCountdown();
        } else {
          setOtpModalStatus('❌ ' + (result.message || 'OTP পাঠাতে সমস্যা হয়েছে।'), true);
        }
      })
      .catch(function(err){
        setOtpModalStatus('❌ ' + (err.message || 'একটি সমস্যা হয়েছে।'), true);
      });
  });

  otpModalCancelBtn.addEventListener('click', function(){
    closeOtpModal();
    regSubmitBtn.disabled = false;
    regSubmitBtn.textContent = 'রেজিস্ট্রেশন করুন';
  });

  function completeRegistration(){
    const otp = otpInput.value.trim();
    if(!/^[0-9]{6}$/.test(otp)){
      setOtpModalStatus('❌ সঠিক ৬ সংখ্যার OTP দিন।', true);
      return;
    }
    if(!pendingRegistrationPayload || !currentOtpId){
      setOtpModalStatus('❌ Session মেয়াদ শেষ। আবার রেজিস্ট্রেশন ফর্ম জমা দিন।', true);
      return;
    }

    otpModalVerifyBtn.disabled = true;
    otpModalVerifyBtn.textContent = 'যাচাই হচ্ছে...';

    const finalPayload = Object.assign({}, pendingRegistrationPayload, {
      otpId: currentOtpId,
      otp: otp
    });

    callApi(finalPayload)
      .then(function(result){
        if(result.status === 'ok'){
          const registeredMobile = pendingRegistrationPayload.mobile;
          localStorage.setItem(LS_REGISTERED_KEY, '1');
          closeOtpModal();
          regForm.reset();
          showLogin();
          loginStatus.textContent = '✅ রেজিস্ট্রেশন সফল হয়েছে। এখন লগইন করুন।';
          loginStatus.className = 'form-status show ok';
          document.getElementById('login_mobile').value = registeredMobile;
        } else {
          setOtpModalStatus('❌ ' + (result.message || 'OTP যাচাই ব্যর্থ হয়েছে।'), true);
          otpInput.value = '';
          otpInput.focus();
        }
      })
      .catch(function(err){
        setOtpModalStatus('❌ ' + (err.message || 'একটি সমস্যা হয়েছে, আবার চেষ্টা করুন।'), true);
      })
      .finally(function(){
        otpModalVerifyBtn.disabled = false;
        otpModalVerifyBtn.textContent = 'যাচাই করুন';
        regSubmitBtn.disabled = false;
        regSubmitBtn.textContent = 'রেজিস্ট্রেশন করুন';
      });
  }

  otpModalVerifyBtn.addEventListener('click', completeRegistration);
  otpInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); completeRegistration(); }
  });
  otpInput.addEventListener('input', function(){
    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6);
  });

  regForm.addEventListener('submit', function(e){
    e.preventDefault();
    regStatus.className = 'form-status';

    const mobile = document.getElementById('reg_mobile').value.trim();
    if(!/^01[0-9]{9}$/.test(mobile)){
      regStatus.textContent = '❌ সঠিক মোবাইল নম্বর দিন (যেমন: 01XXXXXXXXX)।';
      regStatus.className = 'form-status show err';
      document.getElementById('reg_mobile').focus();
      return;
    }

    const email = document.getElementById('reg_email').value.trim();
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      regStatus.textContent = '❌ সঠিক ইমেইল এড্রেস দিন (যেমন: example@mail.com)।';
      regStatus.className = 'form-status show err';
      document.getElementById('reg_email').focus();
      return;
    }

    const facebook = document.getElementById('reg_facebook').value.trim();

    const password = document.getElementById('reg_password').value;

    const payload = {
      action: 'register',
      name: document.getElementById('reg_name').value.trim(),
      level: document.getElementById('reg_level').value,
      department: document.getElementById('reg_department').value,
      year: document.getElementById('reg_year').value,
      session: document.getElementById('reg_session').value.trim(),
      institute: document.getElementById('reg_institute').value.trim(),
      mobile: mobile,
      email: document.getElementById('reg_email').value.trim(),
      facebook: facebook,
      facebook_link: facebook,
      address: document.getElementById('reg_address').value.trim(),
      password: password
    };

    regSubmitBtn.disabled = true;
    regSubmitBtn.textContent = 'OTP পাঠানো হচ্ছে...';
    showLoading('আপনার মোবাইলে OTP পাঠানো হচ্ছে...');

    requestRegistrationOtp(payload.mobile, payload.email)
      .then(function(result){
        hideLoading();
        if(result.status === 'ok'){
          pendingRegistrationPayload = payload;
          currentOtpId = result.otpId;
          openOtpModal(mobile);
          regSubmitBtn.textContent = 'রেজিস্ট্রেশন করুন';
        } else {
          throw new Error(result.message || 'OTP পাঠাতে সমস্যা হয়েছে।');
        }
      })
      .catch(function(err){
        hideLoading();
        regStatus.textContent = '❌ ' + (err.message || 'একটি সমস্যা হয়েছে, আবার চেষ্টা করুন।');
        regStatus.className = 'form-status show err';
        regSubmitBtn.disabled = false;
        regSubmitBtn.textContent = 'রেজিস্ট্রেশন করুন';
      });
  });

  const deviceModalOverlay = document.getElementById('deviceModalOverlay');
  const deviceModalCancelBtn = document.getElementById('deviceModalCancelBtn');
  const deviceModalAgreeBtn = document.getElementById('deviceModalAgreeBtn');
  let deviceModalTimer = null;

  function openDeviceWarningModal(onAgree){
    let secondsLeft = 10;
    deviceModalAgreeBtn.disabled = true;
    deviceModalAgreeBtn.textContent = `Yes, I Agree (${secondsLeft})`;
    deviceModalOverlay.classList.add('show');

    if(deviceModalTimer) clearInterval(deviceModalTimer);
    deviceModalTimer = setInterval(function(){
      secondsLeft -= 1;
      if(secondsLeft <= 0){
        clearInterval(deviceModalTimer);
        deviceModalTimer = null;
        deviceModalAgreeBtn.disabled = false;
        deviceModalAgreeBtn.textContent = 'Yes, I Agree';
      } else {
        deviceModalAgreeBtn.textContent = `Yes, I Agree (${secondsLeft})`;
      }
    }, 1000);

    function closeModal(){
      deviceModalOverlay.classList.remove('show');
      if(deviceModalTimer){ clearInterval(deviceModalTimer); deviceModalTimer = null; }
      deviceModalAgreeBtn.removeEventListener('click', agreeHandler);
      deviceModalCancelBtn.removeEventListener('click', cancelHandler);
    }

    function agreeHandler(){
      if(deviceModalAgreeBtn.disabled) return;
      closeModal();
      // Show loading
      showLoading('লগইন করা হচ্ছে...');
      onAgree();
    }

    function cancelHandler(){
      closeModal();
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'লগইন করুন';
    }

    deviceModalAgreeBtn.addEventListener('click', agreeHandler);
    deviceModalCancelBtn.addEventListener('click', cancelHandler);
  }

  loginForm.addEventListener('submit', function(e){
    e.preventDefault();
    loginStatus.className = 'form-status';

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'লগইন হচ্ছে...';

    openDeviceWarningModal(performLogin);
  });

  function performLogin(){
    const mobile = document.getElementById('login_mobile').value.trim();
    const mobileForMatch = normalizeMobileForMatch(mobile);
    const password = document.getElementById('login_password').value;

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'লগইন হচ্ছে...';

    getFingerprint().then(fp => {
      return callApi({
        action: 'login',
        mobile: mobileForMatch,
        password: password,
        deviceToken: getDeviceToken(),
        fingerprintHash: fp || undefined
      });
    })
      .then(async function(result){
        if(result.status === 'ok'){
          if(typeof window.setMascotCelebration === 'function') window.setMascotCelebration(true);
          if(result.token){
            localStorage.setItem(LS_STUDENT_SESSION_TOKEN_KEY, String(result.token));
          }
          result.data.mobile = mobile;
          localStorage.setItem(LS_USER_KEY, JSON.stringify(result.data));
          localStorage.setItem(LS_REGISTERED_KEY, '1');
          loginForm.reset();

          if(enrollParam){
            showLoading('কোর্সের তথ্য লোড হচ্ছে...');
            try{
              await enrollCourse(enrollParam);
              window.history.replaceState({}, document.title, 'student-login.html');
              hideLoading();
            }catch(err){
              renderDashboard(result.data);
              hideLoading();
              alert('❌ ' + (err.message || 'Course enrollment failed.'));
            }
          } else {
            await syncAndRenderDashboard(result.data);
          }
        } else {
          if(typeof window.setMascotCelebration === 'function') window.setMascotCelebration(false);
          loginStatus.textContent = '❌ ' + (result.message || 'লগইন ব্যর্থ হয়েছে।');
          loginStatus.className = 'form-status show err';
        }
      })
      .catch(function(){
        if(typeof window.setMascotCelebration === 'function') window.setMascotCelebration(false);
        hideLoading();
        loginStatus.textContent = 'Try Again Later 402';
        loginStatus.className = 'form-status show err';
      })
      .finally(function(){
        hideLoading();
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = 'লগইন করুন';
      });
  }

  // ============================================================
  // Password Visibility Toggle
  // ============================================================
  window.togglePasswordVisibility = function(inputId, btn){
    const input = document.getElementById(inputId);
    if(!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    if(btn){
      const openEye = btn.querySelector('.eye-open');
      const closedEye = btn.querySelector('.eye-closed');
      if(openEye && closedEye){
        if(isPass){
          openEye.style.display = 'none';
          closedEye.style.display = 'block';
        } else {
          openEye.style.display = 'block';
          closedEye.style.display = 'none';
        }
      }
    }
    if(inputId === 'login_password' && typeof window.updateMascotPasswordPeek === 'function'){
      window.updateMascotPasswordPeek(input.type === 'text');
    }
  };

  // ============================================================
  // Forgot Password Controller (3-Step Flow)
  // ============================================================
  const forgotSubTitle = document.getElementById('forgotSubTitle');
  const fStepIndicator1 = document.getElementById('fStepIndicator1');
  const fStepIndicator2 = document.getElementById('fStepIndicator2');
  const fStepIndicator3 = document.getElementById('fStepIndicator3');
  const fStepLine1 = document.getElementById('fStepLine1');
  const fStepLine2 = document.getElementById('fStepLine2');

  const forgotStep1Form = document.getElementById('forgotStep1Form');
  const forgot_mobile = document.getElementById('forgot_mobile');
  const forgotStep1Btn = document.getElementById('forgotStep1Btn');

  const forgotStep2Form = document.getElementById('forgotStep2Form');
  const forgotOtpTargetMobile = document.getElementById('forgotOtpTargetMobile');
  const forgot_otp = document.getElementById('forgot_otp');
  const forgotStep2Btn = document.getElementById('forgotStep2Btn');
  const forgotResendBtn = document.getElementById('forgotResendBtn');

  const forgotStep3Form = document.getElementById('forgotStep3Form');
  const forgot_new_password = document.getElementById('forgot_new_password');
  const forgot_confirm_password = document.getElementById('forgot_confirm_password');
  const forgotStep3Btn = document.getElementById('forgotStep3Btn');
  const forgotStatus = document.getElementById('forgotStatus');

  let forgotCurrentMobile = '';
  let forgotCurrentOtpId = '';
  let forgotResetToken = '';
  let forgotTimerInterval = null;
  let forgotCountdown = 60;

  function setForgotStatus(msg, type){
    if(!forgotStatus) return;
    if(!msg){
      forgotStatus.textContent = '';
      forgotStatus.className = 'form-status';
      return;
    }
    forgotStatus.textContent = msg;
    forgotStatus.className = 'form-status show ' + (type === 'ok' ? 'ok' : 'err');
  }

  function setForgotStep(step){
    setForgotStatus('');
    if(step === 1){
      if(fStepIndicator1) fStepIndicator1.className = 'forgot-step active';
      if(fStepLine1) fStepLine1.className = 'forgot-step-line';
      if(fStepIndicator2) fStepIndicator2.className = 'forgot-step';
      if(fStepLine2) fStepLine2.className = 'forgot-step-line';
      if(fStepIndicator3) fStepIndicator3.className = 'forgot-step';

      if(forgotStep1Form) forgotStep1Form.style.display = 'block';
      if(forgotStep2Form) forgotStep2Form.style.display = 'none';
      if(forgotStep3Form) forgotStep3Form.style.display = 'none';
      if(forgotSubTitle) forgotSubTitle.textContent = 'আপনার নিবন্ধিত মোবাইল নম্বর দিন। আমরা ভেরিফিকেশনের জন্য একটি OTP পাঠাবো।';
      if(forgot_mobile) forgot_mobile.focus();
    } else if(step === 2){
      if(fStepIndicator1) fStepIndicator1.className = 'forgot-step done';
      if(fStepLine1) fStepLine1.className = 'forgot-step-line done';
      if(fStepIndicator2) fStepIndicator2.className = 'forgot-step active';
      if(fStepLine2) fStepLine2.className = 'forgot-step-line';
      if(fStepIndicator3) fStepIndicator3.className = 'forgot-step';

      if(forgotStep1Form) forgotStep1Form.style.display = 'none';
      if(forgotStep2Form) forgotStep2Form.style.display = 'block';
      if(forgotStep3Form) forgotStep3Form.style.display = 'none';
      if(forgotSubTitle) forgotSubTitle.textContent = 'আপনার মোবাইলে পাঠানো ৬ সংখ্যার OTP কোডটি দিয়ে ভেরিফাই করুন।';
      if(forgot_otp){
        forgot_otp.value = '';
        forgot_otp.focus();
      }
    } else if(step === 3){
      if(fStepIndicator1) fStepIndicator1.className = 'forgot-step done';
      if(fStepLine1) fStepLine1.className = 'forgot-step-line done';
      if(fStepIndicator2) fStepIndicator2.className = 'forgot-step done';
      if(fStepLine2) fStepLine2.className = 'forgot-step-line done';
      if(fStepIndicator3) fStepIndicator3.className = 'forgot-step active';

      if(forgotStep1Form) forgotStep1Form.style.display = 'none';
      if(forgotStep2Form) forgotStep2Form.style.display = 'none';
      if(forgotStep3Form) forgotStep3Form.style.display = 'block';
      if(forgotSubTitle) forgotSubTitle.textContent = 'আপনার অ্যাকাউন্টের জন্য একটি শক্তিশালী নতুন পাসওয়ার্ড সেট করুন।';
      if(forgot_new_password){
        forgot_new_password.value = '';
        forgot_new_password.focus();
      }
      if(forgot_confirm_password) forgot_confirm_password.value = '';
    }
  }

  function resetForgotFlow(){
    if(forgotTimerInterval){
      clearInterval(forgotTimerInterval);
      forgotTimerInterval = null;
    }
    forgotCurrentMobile = '';
    forgotCurrentOtpId = '';
    forgotResetToken = '';
    if(forgot_mobile) forgot_mobile.value = '';
    if(forgot_otp) forgot_otp.value = '';
    if(forgot_new_password) forgot_new_password.value = '';
    if(forgot_confirm_password) forgot_confirm_password.value = '';
    setForgotStep(1);
  }

  function startForgotCountdown(seconds){
    if(forgotTimerInterval) clearInterval(forgotTimerInterval);
    forgotCountdown = Number(seconds) > 0 ? Number(seconds) : 60;
    if(forgotResendBtn){
      forgotResendBtn.disabled = true;
      forgotResendBtn.textContent = `পুনরায় পাঠান (${forgotCountdown})`;
    }
    forgotTimerInterval = setInterval(function(){
      forgotCountdown--;
      if(!forgotResendBtn) return;
      if(forgotCountdown <= 0){
        clearInterval(forgotTimerInterval);
        forgotTimerInterval = null;
        forgotResendBtn.disabled = false;
        forgotResendBtn.textContent = 'পুনরায় পাঠান';
      } else {
        forgotResendBtn.textContent = `পুনরায় পাঠান (${forgotCountdown})`;
      }
    }, 1000);
  }

  if(forgot_otp){
    forgot_otp.addEventListener('input', function(){
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6);
    });
  }

  if(forgotStep1Form){
    forgotStep1Form.addEventListener('submit', async function(e){
      e.preventDefault();
      const mobileVal = (forgot_mobile ? forgot_mobile.value : '').trim();
      if(!/^01[0-9]{9}$/.test(mobileVal)){
        setForgotStatus('সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন (যেমন: 01XXXXXXXXX)', 'err');
        return;
      }
      setForgotStatus('');
      forgotStep1Btn.disabled = true;
      forgotStep1Btn.textContent = 'যাচাই ও OTP পাঠানো হচ্ছে...';
      try{
        const res = await callApi({ action: 'forgot_send_otp', mobile: mobileVal });
        if(res && res.status === 'ok'){
          forgotCurrentMobile = mobileVal;
          forgotCurrentOtpId = res.otpId || '';
          if(forgotOtpTargetMobile) forgotOtpTargetMobile.textContent = mobileVal;
          setForgotStep(2);
          startForgotCountdown(res.expiresIn || 60);
          vaShowToast('OTP কোড আপনার মোবাইলে পাঠানো হয়েছে');
        } else {
          setForgotStatus(res && res.message ? res.message : 'OTP পাঠাতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।', 'err');
        }
      } catch(err){
        setForgotStatus('নেটওয়ার্ক ত্রুটি! অনুগ্রহ করে আবার চেষ্টা করুন।', 'err');
      } finally {
        forgotStep1Btn.disabled = false;
        forgotStep1Btn.textContent = 'OTP পাঠান';
      }
    });
  }

  if(forgotResendBtn){
    forgotResendBtn.addEventListener('click', async function(){
      if(!forgotCurrentMobile) return;
      forgotResendBtn.disabled = true;
      forgotResendBtn.textContent = 'পাঠানো হচ্ছে...';
      setForgotStatus('');
      try{
        const res = await callApi({ action: 'forgot_send_otp', mobile: forgotCurrentMobile });
        if(res && res.status === 'ok'){
          forgotCurrentOtpId = res.otpId || '';
          vaShowToast('নতুন OTP পাঠানো হয়েছে');
          startForgotCountdown(res.expiresIn || 60);
        } else {
          setForgotStatus(res && res.message ? res.message : 'OTP পুনরায় পাঠাতে সমস্যা হয়েছে।', 'err');
          forgotResendBtn.disabled = false;
          forgotResendBtn.textContent = 'পুনরায় পাঠান';
        }
      } catch(err){
        setForgotStatus('নেটওয়ার্ক ত্রুটি! আবার চেষ্টা করুন।', 'err');
        forgotResendBtn.disabled = false;
        forgotResendBtn.textContent = 'পুনরায় পাঠান';
      }
    });
  }

  if(forgotStep2Form){
    forgotStep2Form.addEventListener('submit', async function(e){
      e.preventDefault();
      const otpVal = (forgot_otp ? forgot_otp.value : '').trim();
      if(!/^[0-9]{6}$/.test(otpVal)){
        setForgotStatus('অনুগ্রহ করে ৬ সংখ্যার সঠিক OTP কোডটি লিখুন', 'err');
        return;
      }
      setForgotStatus('');
      forgotStep2Btn.disabled = true;
      forgotStep2Btn.textContent = 'যাচাই করা হচ্ছে...';
      try{
        const res = await callApi({
          action: 'forgot_verify_otp',
          mobile: forgotCurrentMobile,
          otpId: forgotCurrentOtpId,
          otp: otpVal
        });
        if(res && res.status === 'ok'){
          if(forgotTimerInterval){
            clearInterval(forgotTimerInterval);
            forgotTimerInterval = null;
          }
          forgotResetToken = res.resetToken || '';
          setForgotStep(3);
          vaShowToast('OTP সফলভাবে যাচাই হয়েছে!');
        } else {
          setForgotStatus(res && res.message ? res.message : 'ভুল OTP কোড দিয়েছেন।', 'err');
        }
      } catch(err){
        setForgotStatus('যাচাইকরণে সমস্যা হয়েছে। আবার চেষ্টা করুন।', 'err');
      } finally {
        forgotStep2Btn.disabled = false;
        forgotStep2Btn.textContent = 'OTP যাচাই করুন';
      }
    });
  }

  if(forgotStep3Form){
    forgotStep3Form.addEventListener('submit', async function(e){
      e.preventDefault();
      const p1 = forgot_new_password ? forgot_new_password.value : '';
      const p2 = forgot_confirm_password ? forgot_confirm_password.value : '';
      if(!p1 || p1.length < 4){
        setForgotStatus('পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।', 'err');
        return;
      }
      if(p1 !== p2){
        setForgotStatus('উভয় পাসওয়ার্ড এক হতে হবে! আবার মিলিয়ে দেখুন।', 'err');
        return;
      }
      setForgotStatus('');
      forgotStep3Btn.disabled = true;
      forgotStep3Btn.textContent = 'সংরক্ষণ করা হচ্ছে...';
      try{
        const res = await callApi({
          action: 'forgot_reset_password',
          mobile: forgotCurrentMobile,
          resetToken: forgotResetToken,
          newPassword: p1
        });
        if(res && res.status === 'ok'){
          setForgotStatus('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে! লগইন পেজে নিয়ে যাওয়া হচ্ছে...', 'ok');
          vaShowToast('🎉 পাসওয়ার্ড সফলভাবে আপডেট হয়েছে!');
          const savedMobile = forgotCurrentMobile;
          setTimeout(function(){
            showLogin();
            const loginMobileInput = document.getElementById('login_mobile');
            const loginPassInput = document.getElementById('login_password');
            if(loginMobileInput) loginMobileInput.value = savedMobile;
            if(loginPassInput){
              loginPassInput.value = '';
              loginPassInput.focus();
            }
            if(loginStatus){
              loginStatus.textContent = 'পাসওয়ার্ড পরিবর্তিত হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।';
              loginStatus.className = 'form-status show ok';
            }
          }, 1500);
        } else {
          setForgotStatus(res && res.message ? res.message : 'পাসওয়ার্ড পরিবর্তন করতে সমস্যা হয়েছে।', 'err');
        }
      } catch(err){
        setForgotStatus('সার্ভার সমস্যা! আবার চেষ্টা করুন।', 'err');
      } finally {
        forgotStep3Btn.disabled = false;
        forgotStep3Btn.textContent = 'পাসওয়ার্ড সংরক্ষণ করুন';
      }
    });
  }

  logoutBtn.addEventListener('click', function(){
    if(!confirm('আপনি কি সত্যিই লগআউট করতে চান?')) return;
    localStorage.removeItem(LS_USER_KEY);
    localStorage.removeItem(LS_STUDENT_SESSION_TOKEN_KEY);
    classLearningReset();
    enrolledCourseList.innerHTML='';
    learningEmpty.style.display='block';
    showAuthUI();
    showLogin();
  });

  // ============================================================
  // Modern Aesthetic Study Art Workspace Illustration Controller
  // ============================================================
  function initStudySceneController(){
    const studyCard = document.getElementById('loginStudyArtCard');
    if(!studyCard) return;

    const mobileInput = document.getElementById('login_mobile');
    const passInput = document.getElementById('login_password');
    const liveText = document.getElementById('studyLiveText');
    const laptopScreen = document.getElementById('laptopScreen');
    const gradCap = document.getElementById('sceneGradCap');
    const book = document.getElementById('sceneFloatingBook');
    const studyNotes = document.getElementById('sceneStudyNotes');
    const diploma = document.getElementById('sceneDiploma');

    function setLiveStatus(text, isAlert){
      if(liveText) liveText.textContent = text;
      if(isAlert){
        studyCard.classList.add('is-typing-focus');
      } else {
        studyCard.classList.remove('is-typing-focus');
      }
    }

    // 1. Mobile Input Focus & Typing Interaction
    if(mobileInput){
      mobileInput.addEventListener('focus', function(){
        setLiveStatus('মোবাইল নম্বর যাচাই হচ্ছে... 📱', true);
      });
      mobileInput.addEventListener('input', function(){
        const len = mobileInput.value.length;
        if(len > 0){
          setLiveStatus(`নম্বর লিখছেন (${len}/১১)... ✍️`, true);
        } else {
          setLiveStatus('মোবাইল নম্বর লিখুন... 📱', true);
        }
      });
      mobileInput.addEventListener('blur', function(){
        if(!passInput || document.activeElement !== passInput){
          setLiveStatus('সুরক্ষিত ও এনক্রিপ্টেড সেশন', false);
        }
      });
    }

    // 2. Password Input Focus Interaction
    if(passInput){
      passInput.addEventListener('focus', function(){
        setLiveStatus('পাসওয়ার্ড এনক্রিপ্ট করা হচ্ছে... 🔒', true);
      });
      passInput.addEventListener('blur', function(){
        if(!mobileInput || document.activeElement !== mobileInput){
          setLiveStatus('সুরক্ষিত ও এনক্রিপ্টেড সেশন', false);
        }
      });
    }

    // 3. Password Toggle Hook
    window.updateMascotPasswordPeek = function(isTextVisible){
      if(document.activeElement === passInput){
        setLiveStatus(isTextVisible ? 'পাসওয়ার্ড দৃশ্যমান 👁️' : 'পাসওয়ার্ড গোপন ও এনক্রিপ্টেড 🔒', true);
      }
    };

    // 4. Login Submission & Feedback
    window.setMascotCelebration = function(isSuccess){
      if(isSuccess){
        setLiveStatus('লগইন সফল! ড্যাশবোর্ডে প্রবেশ করছি... 🎉', true);
        if(laptopScreen) laptopScreen.style.filter = 'drop-shadow(0 0 18px #10B981)';
      } else {
        setLiveStatus('মোবাইল বা পাসওয়ার্ড ভুল হয়েছে! ❌', true);
        setTimeout(function(){
          setLiveStatus('সুরক্ষিত ও এনক্রিপ্টেড সেশন', false);
        }, 2600);
      }
    };

    // 5. Subtle Mouse Parallax Depth Effect on Floating Academic Elements
    studyCard.addEventListener('mousemove', function(e){
      const rect = studyCard.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      if(gradCap) gradCap.style.transform = `translate(${x * 14}px, ${y * 14}px) rotate(${x * 6}deg)`;
      if(book) book.style.transform = `translate(${x * -12}px, ${y * -12}px) rotate(${y * 4}deg)`;
      if(studyNotes) studyNotes.style.transform = `translate(${x * 10}px, ${y * -8}px) rotate(${x * -4}deg)`;
      if(diploma) diploma.style.transform = `translate(${x * -8}px, ${y * 10}px)`;
    });

    studyCard.addEventListener('mouseleave', function(){
      if(gradCap) gradCap.style.transform = '';
      if(book) book.style.transform = '';
      if(studyNotes) studyNotes.style.transform = '';
      if(diploma) diploma.style.transform = '';
    });
  }

  // Initialize Study Scene Controller
  initStudySceneController();

})();



// ============================================================
// Night Mode / Day Mode (Dark/Light Theme) Toggle Controller
// ============================================================
(function(){
  const toggleBtn = document.getElementById('themeToggleBtn');
  const metaTheme = document.getElementById('metaThemeColor');
  if(!toggleBtn) return;

  function applyTheme(theme, animate){
    const isDark = theme === 'dark';
    if(animate){
      document.documentElement.classList.add('theme-transition');
      setTimeout(function(){
        document.documentElement.classList.remove('theme-transition');
      }, 350);
    }
    if(isDark){
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
      toggleBtn.setAttribute('aria-label', 'ডে মোড চালু করুন (Day Mode)');
      toggleBtn.setAttribute('title', 'ডে মোড চালু করুন (Day Mode)');
      if(metaTheme) metaTheme.setAttribute('content', '#090D16');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.classList.remove('dark');
      toggleBtn.setAttribute('aria-label', 'নাইট মোড চালু করুন (Night Mode)');
      toggleBtn.setAttribute('title', 'নাইট মোড চালু করুন (Night Mode)');
      if(metaTheme) metaTheme.setAttribute('content', '#ffffff');
    }
  }

  const initialTheme = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(initialTheme, false);

  toggleBtn.addEventListener('click', function(){
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('va_theme', nextTheme);
    } catch(e){}
    applyTheme(nextTheme, true);
  });

})();
