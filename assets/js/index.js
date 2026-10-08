/* =========================================================================================
   এখানে UI interaction + course-data loader রাখা হয়েছে।
   আগে Course data সরাসরি Google Sheet থেকে (gviz) আসত, এখন Cloudflare
   Worker + D1 (VISION_API) থেকে JSON action কল দিয়ে আসে।
   ========================================================================================= */
const VISION_API = "https://late-forest-4748.dreamsicreation.workers.dev";

// Normalize text helper
const normalizeForMatch = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ').replace(/\s+/g, ' ').trim();

// Cache config (12 hours) - LocalStorage
const VA_CACHE_TTL = 12 * 60 * 60 * 1000;
const VA_CACHE_KEYS = ['va_courses', 'va_teachers_list', 'va_gallery_data', 'va_free_videos', 'va_sw_courses'];

function vaGetCache(key){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return null;
    const { data, expires } = JSON.parse(raw);
    if(Date.now() > expires){ localStorage.removeItem(key); return null; }
    return data;
  }catch(e){ return null; }
}
function vaSetCache(key, value, ttl = VA_CACHE_TTL){
  try{
    localStorage.setItem(key, JSON.stringify({ data: value, expires: Date.now() + ttl }));
  }catch(e){}
}
function vaClearAllCache(){
  VA_CACHE_KEYS.forEach(k => {
    try { localStorage.removeItem(k); } catch(e){}
    try { sessionStorage.removeItem(k); } catch(e){}
  });
  ['va_courses_detail', 'va_courses_teachers', 'va_sw_courses_detail'].forEach(k => {
    try { localStorage.removeItem(k); } catch(e){}
    try { sessionStorage.removeItem(k); } catch(e){}
  });
}

// Sync cache version with server
let cacheCheckPromise = null;
function ensureCacheValid(){
  if(!cacheCheckPromise){
    cacheCheckPromise = (async function(){
      try{
        const res = await fetch(VISION_API, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'get_cache_version' })
        });
        if(!res.ok) return;
        const j = await res.json();
        if(j.status !== 'ok') return;
        const serverV = String(j.v ?? '0');
        const localV  = localStorage.getItem('va_cv');
        if(localV === null || serverV !== localV){
          vaClearAllCache();
          localStorage.setItem('va_cv', serverV);
        }
      }catch(e){}
    })();
  }
  return cacheCheckPromise;
}

// Mobile nav toggle
document.getElementById('burgerBtn').addEventListener('click', () => {
  document.getElementById('navLinks').classList.toggle('open');
});
document.querySelectorAll('#navLinks a').forEach(link => {
  link.addEventListener('click', () => {
    document.getElementById('navLinks').classList.remove('open');
  });
});

// Hero stats counter animation
(function(){
  document.querySelectorAll('#hero-stats .stat-card').forEach((card, i) => {
    setTimeout(() => card.classList.add('visible'), 80 + i * 140);
  });

  const bnDigits = '০১২৩৪৫৬৭৮৯';
  const enDigits = '0123456789';
  const bn2en = s => s.replace(/[০-৯]/g, d => enDigits[bnDigits.indexOf(d)]);
  const en2bn = n => String(n).replace(/[0-9]/g, d => bnDigits[enDigits.indexOf(d)]);

  const numberEls = document.querySelectorAll('.stat-number');

  function animateCount(el){
    const finalText = el.getAttribute('data-final') || '';
    const isEn = /[0-9]/.test(finalText) && !/[০-৯]/.test(finalText);
    const hasComma = finalText.includes(',');
    const suffix = finalText.replace(/[0-9০-৯,]/g, '');
    const numStr = bn2en(finalText.replace(/[^0-9০-৯]/g, ''));
    const target = parseInt(numStr, 10) || 0;
    // Counter duration by target
    const duration = target <= 50 ? 1200 : (target >= 100000 ? 1500 : 2000);
    const start = performance.now();

    function tick(now){
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(target * eased);
      const formattedNum = hasComma ? current.toLocaleString('en-US') : String(current);
      el.textContent = (isEn ? formattedNum : en2bn(formattedNum)) + suffix;
      if(progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const statsBox = document.getElementById('hero-stats');
  if(statsBox && numberEls.length){
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          numberEls.forEach(animateCount);
          observer.disconnect();
        }
      });
    }, { threshold: 0.3 });
    observer.observe(statsBox);
  }
})();

// Pinboard auto-scroll carousel
(function(){
  const track = document.getElementById('pinTrack');
  if(!track) return;

  function driveImageUrl(url){
    if(!url) return '';
    const cleanUrl = String(url).trim();
    const f = cleanUrl.match(/drive\.google\.com\/file\/d\/([^/?]+)/i);
    const i = cleanUrl.match(/[?&]id=([^&]+)/i);
    if(f) return `https://drive.google.com/thumbnail?id=${f[1]}&sz=w1000`;
    if(cleanUrl.includes('drive.google.com') && i) return `https://drive.google.com/thumbnail?id=${i[1]}&sz=w1000`;
    return cleanUrl;
  }

  // Drive image URL format
  track.querySelectorAll('.pin-card img').forEach(img => {
    const raw = img.getAttribute('src') || img.src;
    if(raw) img.src = driveImageUrl(raw);
  });

  const totalReal = track.children.length - 1;
  let pinIndex = 0;
  const TRANSITION_MS = 700;

  function goNext(){
    pinIndex++;
    track.style.transition = `transform ${TRANSITION_MS}ms ease`;
    track.style.transform = `translateX(-${pinIndex * 100}%)`;

    if(pinIndex === totalReal){
      // Loop back to start
      setTimeout(() => {
        track.style.transition = 'none';
        pinIndex = 0;
        track.style.transform = `translateX(0%)`;
      }, TRANSITION_MS);
    }
  }

  if(totalReal > 1){
    setInterval(goNext, 3000);
  }
})();

// Dynamic teachers
(function(){
  const teacherGrid = document.getElementById('teacherGrid');
  if(!teacherGrid) return;

  const clean = v => String(v ?? '').trim();
  const esc = v => clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function imageUrl(v){
    const x=clean(v);
    const f=x.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    const i=x.match(/[?&]id=([^&]+)/i);
    if(f) return `https://drive.google.com/thumbnail?id=${f[1]}&sz=w1000`;
    if(x.includes('drive.google.com')&&i) return `https://drive.google.com/thumbnail?id=${i[1]}&sz=w1000`;
    return x;
  }
  function renderTeachersList(teachers){
    if(!teachers || !teachers.length){
      teacherGrid.innerHTML='<div class="teacher-data-state">এখনো কোনো শিক্ষক তথ্য পাওয়া যায়নি।</div>';
      return;
    }
    teacherGrid.innerHTML=teachers.map(t=>`
      <a class="teacher-card" href="teachers.html">
        <img class="teacher-photo" src="${esc(t.photo)}" alt="${esc(t.name)}" loading="lazy">
        <div class="teacher-info">
          <div class="name">${esc(t.name)}</div>
          <div class="subject">${esc(t.subject)}</div>
        </div>
        <svg class="teacher-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
      </a>
    `).join('');
  }

  async function loadTeachers(){
    await ensureCacheValid();
    const cached = vaGetCache('va_teachers_list');
    if(cached && cached.length){
      renderTeachersList(cached);
      return;
    }
    teacherGrid.innerHTML='<div class="teacher-data-state">শিক্ষকবৃন্দের তথ্য লোড হচ্ছে...</div>';
    try{
      const r=await fetch(VISION_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'get_teachers'})});
      if(!r.ok) throw Error(`Teachers: HTTP ${r.status}`);
      const j=await r.json();
      if(j.status==='error') throw Error(j.message||'Teachers API error');
      const teachers=(j.data||[]).map(row=>{
        const name=clean(row.name);
        if(!name) return null;
        return {
          name,
          photo:imageUrl(row.photo),
          subject:clean(row.subject),
          designation:clean(row.designation)
        };
      }).filter(Boolean);

      vaSetCache('va_teachers_list', teachers);
      renderTeachersList(teachers);
    }catch(e){
      console.error(e);
      teacherGrid.innerHTML='<div class="teacher-data-state">শিক্ষকদের তথ্য লোড করা যায়নি। ইন্টারনেট কানেকশন চেক করুন।</div>';
    }
  }
  loadTeachers();
})();

// Gallery and student feedback marquee
(function(){
  const galleryWrap = document.getElementById('galleryWrap');
  const galleryTrack = document.getElementById('galleryTrack');
  const gallerySection = document.getElementById('gallery');
  const feedbackWrap = document.getElementById('feedbackWrap');
  const feedbackTrack = document.getElementById('feedbackTrack');
  const feedbackSection = document.getElementById('student-feedback');
  if(!galleryTrack && !feedbackTrack) return;

  const esc = v => String(v ?? '').trim().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Image preview modal
  const modalOverlay = document.getElementById('imgModalOverlay');
  const modalImage = document.getElementById('imgModalImage');
  const modalClose = document.getElementById('imgModalClose');
  let pausedTrack = null;

  function openImageModal(src, track){
    if(!modalOverlay || !modalImage) return;
    modalImage.src = src;
    modalOverlay.classList.add('active');
    pausedTrack = track || null;
    if(pausedTrack) pausedTrack.style.animationPlayState = 'paused';
  }
  function closeImageModal(){
    if(!modalOverlay) return;
    modalOverlay.classList.remove('active');
    modalImage.src = '';
    if(pausedTrack) pausedTrack.style.animationPlayState = 'running';
    pausedTrack = null;
  }
  if(modalOverlay){
    modalClose?.addEventListener('click', closeImageModal);
    modalOverlay.addEventListener('click', (e)=>{ if(e.target === modalOverlay) closeImageModal(); });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeImageModal(); });
  }

  // Infinite marquee setup
  function setupInfiniteTrack(trackEl, wrapEl, sectionEl, items, altText){
    if(!trackEl || !wrapEl) return;
    if(!items || !items.length){
      wrapEl.style.display = 'none';
      if(sectionEl) sectionEl.style.display = 'none';
      return;
    }

    wrapEl.style.display = '';
    if(sectionEl) sectionEl.style.display = '';

    // Ensure minimum 8 items
    let baseSet = [...items];
    while(baseSet.length < 8){
      baseSet = baseSet.concat(items);
    }

    // Duplicate set for seamless loop
    const setHtml = baseSet.map(url => `<img src="${esc(url)}" alt="${esc(altText)}" loading="lazy" onerror="this.remove()">`).join('');
    trackEl.innerHTML = setHtml + setHtml;

    // Animation speed
    const duration = Math.max(20, baseSet.length * 4.5);
    trackEl.style.animationDuration = duration + 's';

    trackEl.querySelectorAll('img').forEach(img=>{
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', ()=> openImageModal(img.src, trackEl));
    });
  }

  function renderGalleryImages(images){
    setupInfiniteTrack(galleryTrack, galleryWrap, gallerySection, images, 'Gallery');
  }

  function renderFeedbackImages(images){
    setupInfiniteTrack(feedbackTrack, feedbackWrap, feedbackSection, images, 'শিক্ষার্থীর মতামত');
  }

  // ============================================================
  // NOTIFICATION POPUP MODAL (Gallery Table -> modal_notify 1st row)
  // ============================================================
  let notifyPopupTimer = null;
  let notifyPopupStartTime = 0;
  let notifyPopupRemainingMs = 5000;
  let notifyModalShown = false;

  function convertDriveImageUrl(v){
    const x = String(v ?? '').trim();
    const f = x.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    const i = x.match(/[?&]id=([^&]+)/i);
    if(f) return `https://drive.google.com/thumbnail?id=${f[1]}&sz=w1000`;
    if(x.includes('drive.google.com') && i) return `https://drive.google.com/thumbnail?id=${i[1]}&sz=w1000`;
    return x;
  }

  function initAndShowNotifyModal(rawUrl){
    if(notifyModalShown) return;
    const cleanUrl = String(rawUrl || '').trim();
    if(!cleanUrl || ['null', 'undefined', '-', 'none', 'n/a'].includes(cleanUrl.toLowerCase())) {
      return;
    }

    const modal = document.getElementById('coursePopupModal');
    const img = document.getElementById('coursePopupImage');
    const closeBtn = document.getElementById('coursePopupClose');
    const timerFill = document.getElementById('coursePopupTimerFill');
    if(!modal || !img) return;

    const finalImg = convertDriveImageUrl(cleanUrl);
    if(!finalImg) return;

    notifyModalShown = true;
    img.src = finalImg;
    img.alt = 'Notification';

    function closeModal(){
      clearTimeout(notifyPopupTimer);
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      setTimeout(()=>{
        if(!modal.classList.contains('show')) modal.style.display = 'none';
      }, 380);
    }

    function startCountdown(ms){
      clearTimeout(notifyPopupTimer);
      notifyPopupStartTime = Date.now();
      notifyPopupRemainingMs = ms;
      notifyPopupTimer = setTimeout(closeModal, ms);
      if(timerFill){
        timerFill.style.animation = 'none';
        void timerFill.offsetWidth;
        timerFill.style.animation = `coursePopupCountdown ${ms}ms linear forwards`;
      }
    }

    closeBtn?.addEventListener('click', (e)=>{
      e.stopPropagation();
      closeModal();
    });

    modal.addEventListener('click', (e)=>{
      if(e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && modal.classList.contains('show')) closeModal();
    });

    const card = modal.querySelector('.course-popup-card');
    if(card){
      card.addEventListener('mouseenter', ()=>{
        clearTimeout(notifyPopupTimer);
        notifyPopupRemainingMs = Math.max(800, notifyPopupRemainingMs - (Date.now() - notifyPopupStartTime));
        if(timerFill) timerFill.style.animationPlayState = 'paused';
      });
      card.addEventListener('mouseleave', ()=>{
        if(modal.classList.contains('show')){
          notifyPopupStartTime = Date.now();
          notifyPopupTimer = setTimeout(closeModal, notifyPopupRemainingMs);
          if(timerFill) timerFill.style.animationPlayState = 'running';
        }
      });
    }

    setTimeout(()=>{
      modal.style.display = 'flex';
      void modal.offsetWidth;
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');

      let countdownStarted = false;
      function triggerCountdown(){
        if(countdownStarted) return;
        countdownStarted = true;
        startCountdown(5000);
      }
      if(img.complete && img.naturalWidth > 0){
        triggerCountdown();
      } else {
        img.onload = triggerCountdown;
        img.onerror = triggerCountdown;
        setTimeout(triggerCountdown, 2500);
      }
    }, 400);
  }

  async function loadGallery(){
    await ensureCacheValid();
    const cached = vaGetCache('va_gallery_data');
    if(cached){
      renderGalleryImages(cached.images || []);
      renderFeedbackImages(cached.feedbackImages || []);
      if(cached.modalNotify){
        initAndShowNotifyModal(cached.modalNotify);
      }
      return;
    }
    try{
      const r = await fetch(VISION_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'get_gallery'})});
      if(!r.ok) throw Error(`Gallery: HTTP ${r.status}`);
      const j = await r.json();
      if(j.status === 'error') throw Error(j.message || 'Gallery API error');

      // Separate images and feedback
      const data = j.data;
      const images = Array.isArray(data) ? data.filter(Boolean) : (Array.isArray(data?.images) ? data.images.filter(Boolean) : []);
      const feedbackImages = Array.isArray(data?.feedbackImages) ? data.feedbackImages.filter(Boolean) : [];
      const modalNotify = String(data?.modalNotify || '').trim();

      vaSetCache('va_gallery_data', { images, feedbackImages, modalNotify });
      renderGalleryImages(images);
      renderFeedbackImages(feedbackImages);
      if(modalNotify){
        initAndShowNotifyModal(modalNotify);
      }
    }catch(e){
      console.error('Gallery load failed:', e);
      if(galleryWrap) galleryWrap.style.display = 'none';
      if(gallerySection) gallerySection.style.display = 'none';
      if(feedbackWrap) feedbackWrap.style.display = 'none';
      if(feedbackSection) feedbackSection.style.display = 'none';
    }
  }
  loadGallery();
})();

// Toast notification
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

// Dynamic courses
(function(){
  const SHEET_TABS = ['SSC','HSC','BBA','MBA','BBS','BBA Professional'];
  const catGrid=document.getElementById('catGrid'), courseGrid=document.getElementById('courseGrid'), toolbar=document.getElementById('courseDataToolbar'), resultCount=document.getElementById('courseResultCount'), errorBox=document.getElementById('courseDataError'), retryBtn=document.getElementById('courseRetryBtn');
  const CATEGORY_META={
    'SSC':{
      color:'#2563eb',
      bg:'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      border:'#bfdbfe',
      shadow:'rgba(37,99,235,0.22)',
      svg3d:`<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sscCapTop" x1="12" y1="12" x2="52" y2="34" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#60a5fa"/><stop offset="45%" stop-color="#2563eb"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient>
    <linearGradient id="sscCapSide" x1="20" y1="26" x2="44" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#1e40af"/><stop offset="100%" stop-color="#0f172a"/></linearGradient>
    <linearGradient id="sscTassel" x1="32" y1="18" x2="52" y2="42" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/></linearGradient>
    <filter id="sscDrop" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse"><feDropShadow dx="0" dy="3.5" stdDeviation="3.5" flood-color="#1d4ed8" flood-opacity="0.32"/></filter>
  </defs>
  <ellipse cx="32" cy="56" rx="20" ry="3.5" fill="#1e3a8a" fill-opacity="0.22"/>
  <path d="M20 28 C20 40 44 40 44 28 L44 36 C44 46 20 46 20 36 Z" fill="url(#sscCapSide)"/>
  <path d="M32 10 L56 23 L32 35 L8 23 Z" fill="url(#sscCapTop)" filter="url(#sscDrop)"/>
  <path d="M32 10 L56 23 L32 25 L8 23 Z" fill="#ffffff" fill-opacity="0.25"/>
  <ellipse cx="32" cy="22.5" rx="3.5" ry="2" fill="#fbbf24"/>
  <path d="M32 22.5 Q42 22 47 28 T50 43" stroke="url(#sscTassel)" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="50" cy="44" rx="3" ry="4.5" fill="#f59e0b"/>
  <rect x="47.5" y="42" width="5" height="1.8" rx="0.9" fill="#fef08a"/>
</svg>`
    },
    'HSC':{
      color:'#059669',
      bg:'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
      border:'#a7f3d0',
      shadow:'rgba(16,185,129,0.22)',
      svg3d:`<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hscRoof" x1="12" y1="12" x2="52" y2="28" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#34d399"/><stop offset="50%" stop-color="#10b981"/><stop offset="100%" stop-color="#059669"/></linearGradient>
    <linearGradient id="hscPillar" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#a7f3d0"/><stop offset="40%" stop-color="#ffffff"/><stop offset="100%" stop-color="#6ee7b7"/></linearGradient>
    <linearGradient id="hscBase" x1="10" y1="46" x2="54" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#059669"/><stop offset="100%" stop-color="#047857"/></linearGradient>
    <filter id="hscDrop" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse"><feDropShadow dx="0" dy="3.5" stdDeviation="3.5" flood-color="#059669" flood-opacity="0.32"/></filter>
  </defs>
  <ellipse cx="32" cy="58" rx="22" ry="3.5" fill="#064e3b" fill-opacity="0.22"/>
  <path d="M10 50 L54 50 L52 56 L12 56 Z" fill="url(#hscBase)"/>
  <rect x="8" y="54" width="48" height="3.5" rx="1.5" fill="#047857"/>
  <path d="M32 10 L56 24 L8 24 Z" fill="url(#hscRoof)" filter="url(#hscDrop)"/>
  <path d="M32 10 L56 24 L32 22 L8 24 Z" fill="#ffffff" fill-opacity="0.3"/>
  <ellipse cx="32" cy="18" rx="3.5" ry="3.5" fill="#fef08a"/>
  <path d="M27 50 V37 C27 34 37 34 37 37 V50 Z" fill="#064e3b"/>
  <rect x="13" y="24" width="5" height="26" rx="1.5" fill="url(#hscPillar)"/>
  <rect x="22" y="24" width="4.5" height="26" rx="1.5" fill="url(#hscPillar)"/>
  <rect x="37.5" y="24" width="4.5" height="26" rx="1.5" fill="url(#hscPillar)"/>
  <rect x="46" y="24" width="5" height="26" rx="1.5" fill="url(#hscPillar)"/>
</svg>`
    },
    'BBA':{
      color:'#e11d48',
      bg:'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
      border:'#fecdd3',
      shadow:'rgba(225,29,72,0.22)',
      svg3d:`<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bbaCover" x1="8" y1="20" x2="56" y2="54" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fb7185"/><stop offset="40%" stop-color="#e11d48"/><stop offset="100%" stop-color="#9f1239"/></linearGradient>
    <linearGradient id="bbaPageL" x1="12" y1="20" x2="31" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffffff"/><stop offset="85%" stop-color="#fff1f2"/><stop offset="100%" stop-color="#fecdd3"/></linearGradient>
    <linearGradient id="bbaPageR" x1="52" y1="20" x2="33" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffffff"/><stop offset="85%" stop-color="#fff1f2"/><stop offset="100%" stop-color="#fecdd3"/></linearGradient>
    <linearGradient id="bbaRibbon" x1="32" y1="18" x2="36" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fef08a"/><stop offset="60%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/></linearGradient>
    <filter id="bbaDrop" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse"><feDropShadow dx="0" dy="3.5" stdDeviation="3.5" flood-color="#be123c" flood-opacity="0.32"/></filter>
  </defs>
  <ellipse cx="32" cy="57" rx="22" ry="3.5" fill="#881337" fill-opacity="0.22"/>
  <path d="M8 43 C18 40 28 44 32 46 C36 44 46 40 56 43 L54 48 C44 45 35 48 32 50 C29 48 20 45 10 48 Z" fill="url(#bbaCover)" filter="url(#bbaDrop)"/>
  <path d="M10 20 C20 18 29 22 32 25 L32 44 C29 41 20 37 10 39 Z" fill="url(#bbaPageL)"/>
  <path d="M15 26 H27 M15 30 H25 M15 34 H23" stroke="#f43f5e" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.45"/>
  <path d="M54 20 C44 18 35 22 32 25 L32 44 C35 41 44 37 54 39 Z" fill="url(#bbaPageR)"/>
  <path d="M37 26 H49 M39 30 H49 M41 34 H49" stroke="#f43f5e" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.45"/>
  <path d="M31 22 Q34 36 31 52 L34.5 49 L38 52 Q35 36 33 22 Z" fill="url(#bbaRibbon)"/>
</svg>`
    },
    'MBA':{
      color:'#7c3aed',
      bg:'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
      border:'#ddd6fe',
      shadow:'rgba(124,58,237,0.22)',
      svg3d:`<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mbaCap" x1="12" y1="12" x2="52" y2="34" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#c084fc"/><stop offset="50%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#6d28d9"/></linearGradient>
    <linearGradient id="mbaBase" x1="20" y1="26" x2="44" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#5b21b6"/><stop offset="100%" stop-color="#2e1065"/></linearGradient>
    <linearGradient id="mbaGold" x1="26" y1="36" x2="46" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/></linearGradient>
    <filter id="mbaDrop" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse"><feDropShadow dx="0" dy="3.5" stdDeviation="3.5" flood-color="#7c3aed" flood-opacity="0.35"/></filter>
  </defs>
  <ellipse cx="32" cy="56" rx="20" ry="3.5" fill="#3b0764" fill-opacity="0.25"/>
  <path d="M20 27 C20 38 44 38 44 27 L44 34 C44 44 20 44 20 34 Z" fill="url(#mbaBase)"/>
  <path d="M32 9 L57 22 L32 34 L7 22 Z" fill="url(#mbaCap)" filter="url(#mbaDrop)"/>
  <path d="M32 9 L57 22 L32 24 L7 22 Z" fill="#ffffff" fill-opacity="0.32"/>
  <circle cx="32" cy="40" r="7" fill="url(#mbaGold)"/>
  <path d="M32 36 L33.5 39 L37 39.5 L34.5 42 L35.5 45 L32 43.5 L28.5 45 L29.5 42 L27 39.5 L30.5 39 Z" fill="#ffffff" fill-opacity="0.9"/>
  <ellipse cx="32" cy="21.5" rx="3.5" ry="2" fill="#fef08a"/>
  <path d="M32 21.5 Q43 21 48 27 T51 40" stroke="url(#mbaGold)" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="51" cy="41" rx="2.8" ry="4" fill="#f59e0b"/>
</svg>`
    },
    'BBS':{
      color:'#d97706',
      bg:'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
      border:'#fde68a',
      shadow:'rgba(217,119,6,0.22)',
      svg3d:`<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bbsCover" x1="14" y1="10" x2="52" y2="52" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fbbf24"/><stop offset="45%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/></linearGradient>
    <linearGradient id="bbsSpine" x1="14" y1="10" x2="20" y2="52" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#78350f"/></linearGradient>
    <linearGradient id="bbsPages" x1="20" y1="14" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#fde68a"/></linearGradient>
    <linearGradient id="bbsGold" x1="42" y1="28" x2="52" y2="38" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fef08a"/><stop offset="100%" stop-color="#d97706"/></linearGradient>
    <filter id="bbsDrop" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse"><feDropShadow dx="0" dy="3.5" stdDeviation="3.5" flood-color="#b45309" flood-opacity="0.35"/></filter>
  </defs>
  <ellipse cx="32" cy="57" rx="20" ry="3.5" fill="#78350f" fill-opacity="0.25"/>
  <rect x="18" y="14" width="34" height="42" rx="4" fill="#78350f"/>
  <rect x="18" y="12" width="32" height="42" rx="3" fill="url(#bbsPages)"/>
  <line x1="50" y1="16" x2="50" y2="50" stroke="#d97706" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 2"/>
  <rect x="14" y="9" width="34" height="43" rx="4" fill="url(#bbsCover)" filter="url(#bbsDrop)"/>
  <path d="M14 9 H18 V52 H14 C12 52 11 50 11 48 V13 C11 11 12 9 14 9 Z" fill="url(#bbsSpine)"/>
  <rect x="18" y="12" width="2" height="38" fill="#ffffff" fill-opacity="0.3"/>
  <path d="M42 27 H51 C52.5 27 53.5 28.2 53.5 29.8 V33.2 C53.5 34.8 52.5 36 51 36 H42 Z" fill="url(#bbsGold)"/>
  <circle cx="48" cy="31.5" r="2" fill="#78350f"/>
</svg>`
    },
    'BBA Professional':{
      color:'#e11d48',
      bg:'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
      border:'#fecdd3',
      shadow:'rgba(225,29,72,0.22)',
      svg3d:`<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="proBody" x1="12" y1="18" x2="52" y2="54" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fb7185"/><stop offset="40%" stop-color="#e11d48"/><stop offset="100%" stop-color="#9f1239"/></linearGradient>
    <linearGradient id="proFlap" x1="12" y1="18" x2="52" y2="38" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fda4af"/><stop offset="100%" stop-color="#e11d48"/></linearGradient>
    <linearGradient id="proGold" x1="20" y1="30" x2="44" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fef08a"/><stop offset="100%" stop-color="#d97706"/></linearGradient>
    <filter id="proDrop" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse"><feDropShadow dx="0" dy="3.5" stdDeviation="3.5" flood-color="#9f1239" flood-opacity="0.35"/></filter>
  </defs>
  <ellipse cx="32" cy="57" rx="20" ry="3.5" fill="#881337" fill-opacity="0.25"/>
  <path d="M26 18 V12 C26 10 28 8 30 8 H34 C36 8 38 10 38 12 V18" stroke="#be123c" stroke-width="3" stroke-linecap="round"/>
  <rect x="24.5" y="15" width="3" height="4" rx="1" fill="#fbbf24"/>
  <rect x="36.5" y="15" width="3" height="4" rx="1" fill="#fbbf24"/>
  <rect x="10" y="18" width="44" height="36" rx="6" fill="url(#proBody)" filter="url(#proDrop)"/>
  <path d="M10 18 H54 V33 C54 35 52 37 49 37 H15 C12 37 10 35 10 33 Z" fill="url(#proFlap)"/>
  <line x1="12" y1="20" x2="52" y2="20" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.4"/>
  <rect x="20" y="32" width="6" height="8" rx="1.5" fill="url(#proGold)"/>
  <circle cx="23" cy="36" r="1" fill="#881337"/>
  <rect x="38" y="32" width="6" height="8" rx="1.5" fill="url(#proGold)"/>
  <circle cx="41" cy="36" r="1" fill="#881337"/>
</svg>`
    }
  };
  let allCourses=[],activeCategory=null;
  const bn='০১২৩৪৫৬৭৮৯',en='0123456789';
  const toBn=v=>String(v??'').replace(/[0-9]/g,d=>bn[en.indexOf(d)]);
  const clean=v=>String(v??'').trim();
  const esc=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function imageUrl(v){const x=clean(v),f=x.match(/drive\.google\.com\/file\/d\/([^/]+)/i),i=x.match(/[?&]id=([^&]+)/i);if(f)return `https://drive.google.com/thumbnail?id=${f[1]}&sz=w1000`;if(x.includes('drive.google.com')&&i)return `https://drive.google.com/thumbnail?id=${i[1]}&sz=w1000`;return x}
  function slugify(v){return clean(v).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9\u0980-\u09ff]+/g,'-').replace(/^-+|-+$/g,'')||'course'}
  function uniqueSlug(name,cat,used){const base=slugify(name),cp=slugify(cat);let slug=base;if(used.has(slug))slug=`${cp}-${base}`;let n=2;while(used.has(slug))slug=`${cp}-${base}-${n++}`;used.add(slug);return slug}
  function features(v){return clean(v).split(/[,،]/).map(clean).filter(Boolean)}
  function price(v){const x=clean(v);if(!x || x === '-')return '';if(/\bfree\b/i.test(x)) return x;return /[৳$€£]/.test(x)?toBn(x):`৳${toBn(x)}`}
  // Get enrolled courses
  function getEnrolledCourseNames(){
    try{
      const raw = localStorage.getItem('va_user');
      if(!raw) return new Set();
      const user = JSON.parse(raw);
      const courses = Array.isArray(user?.courses) ? user.courses : [];
      return new Set(courses.map(c=>normalizeForMatch(c?.name)).filter(Boolean));
    }catch(e){ return new Set(); }
  }
  const enrolledCourseNames = getEnrolledCourseNames();
  async function fetchAllCourseRows(){
    await ensureCacheValid();
    const cached = vaGetCache('va_courses');
    if(cached && cached.length) return cached;

    const r=await fetch(VISION_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'get_courses'})});
    if(!r.ok)throw Error(`Course Name: HTTP ${r.status}`);
    const j=await r.json();
    if(j.status==='error') throw Error(j.message||'Course Name API error');
    const used = new Set();
    const courses = (j.data||[]).map(row=>{
      const level=clean(row.level), name=clean(row.name);
      if(!level||!name) return null;
      return {
        name,
        tag:clean(row.tag),
        image:imageUrl(row.image),
        shortDescription:clean(row.shortDescription),
        longDescription:clean(row.longDescription),
        price:price(row.price),
        oldPrice:price(row.oldPrice),
        priceNote:clean(row.priceNote),
        features:features(row.featureText),
        teachers:clean(row.teachers),
        teacherNames:features(row.teachers),
        subjectList:clean(row.subjectList || row.subject_list),
        category:level,
        slug:uniqueSlug(name,level,used),
        // D1 top_this is treated as a strict publish flag.
        // Accept yes / true / 1 regardless of capitalization or surrounding spaces.
        topThis: ['yes','true','1'].includes(String(row.topThisRaw ?? row.topThis ?? row.top_this ?? '').trim().toLowerCase()) || row.topThis === true || String(row.top_this ?? '').trim().toLowerCase() === 'true' || String(row.top_this ?? '').trim().toLowerCase() === 'yes',
        topThisRaw: String(row.topThisRaw ?? row.topThis ?? row.top_this ?? '').trim().toLowerCase()
      };
    }).filter(Boolean);
    vaSetCache('va_courses', courses, VA_CACHE_TTL);
    return courses;
  }
  function categoryHtml(cat,count){const m=CATEGORY_META[cat]||{color:'#5B8FBF',bg:'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',border:'#bfdbfe',shadow:'rgba(91,143,191,0.22)',svg3d:'<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="20" fill="#3b82f6"/></svg>'};return `<a href="All_Courses.html?level=${encodeURIComponent(cat)}" class="cat-card" data-cat="${esc(cat)}" style="--cat-color:${m.color};--cat-border:${m.border};--cat-shadow:${m.shadow}"><span class="cat-icon" style="background:${m.bg};border-color:${m.border}">${m.svg3d}</span><span class="cat-text"><b>${esc(cat)}</b><span>${toBn(count)}টি কোর্স</span></span></a>`}
  // Check subject-wise tag
  function isSubjectWiseTag(tag){const t=normalizeForMatch(tag);return t.includes('subject wise')||t.includes('improvement')}
  function cardHtml(c){
    const catNorm = normalizeForMatch(c.category);
    const isBba = catNorm === 'bba' || catNorm === 'bba nu' || catNorm === 'bba dcu';
    const m = CATEGORY_META[c.category] || (isBba && !catNorm.includes('pro') ? CATEGORY_META['BBA'] : {color:'#5B8FBF'});
    const isEnrolled = enrolledCourseNames.has(normalizeForMatch(c.name));

    let actionHtml;
    if(isEnrolled){
      actionHtml=`<a href="student-login.html" class="btn btn-primary course-enrolled-trigger">ভর্তি হয়েছেন ✓</a>`;
    }else if(isSubjectWiseTag(c.tag)){
      actionHtml=`<a href="per-subject.html" class="btn btn-primary">বিস্তারিত</a>`;
    }else{
      actionHtml=`<a href="course-details.html?course=${encodeURIComponent(c.slug)}" data-course-name="${esc(c.name)}" data-has-subjects="${clean(c.subjectList) ? '1' : '0'}" class="btn btn-primary course-details-trigger">বিস্তারিত</a>`;
    }
    return `<article class="course-card" data-category="${esc(c.category)}" data-course-slug="${esc(c.slug)}"><img class="course-image" src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy"><div class="course-top"><span class="eyebrow" style="color:${m.color}">${esc(c.category)}</span>${c.tag?`<span class="course-tag">${esc(c.tag)}</span>`:''}</div><div class="course-body"><h3>${esc(c.name)}</h3><p>${esc(c.shortDescription)}</p><div class="course-foot"><div class="price"><div class="price-row">${c.price?`<span class="price-now">${esc(c.price)}</span>`:''}${c.oldPrice?`<span class="price-old">${esc(c.oldPrice)}</span>`:''}</div>${c.priceNote?`<small>${esc(c.priceNote)}</small>`:''}</div>${actionHtml}</div></div></article>`;
  }
  function renderCategories(){
    const counts={};
    allCourses.forEach(c=>{
      let cat = c.category;
      const catNorm = normalizeForMatch(cat);
      if(catNorm === 'bba nu' || catNorm === 'bba dcu') cat = 'BBA';
      const tab=SHEET_TABS.find(t=>normalizeForMatch(t)===normalizeForMatch(cat));
      const key=tab||cat;
      counts[key]=(counts[key]||0)+1;
    });
    catGrid.innerHTML=SHEET_TABS.map(t=>categoryHtml(t,counts[t]||0)).join('');
  }
  function renderCourses(cat=null){
    activeCategory=cat;
    const isBbaTab = cat && normalizeForMatch(cat) === 'bba';
    const list=cat
      ? allCourses.filter(c=>{
          if(isBbaTab){
            const cNorm = normalizeForMatch(c.category);
            return cNorm === 'bba' || cNorm === 'bba nu' || cNorm === 'bba dcu';
          }
          return normalizeForMatch(c.category)===normalizeForMatch(cat);
        })
      : allCourses;

    courseGrid.innerHTML=(
      list.length
        ? list.map(cardHtml).join('')
        : '<div class="course-empty"><strong style="font-size:20px;margin-bottom:0;">Upcoming</strong></div>'
    );

    catGrid.style.display='';
    toolbar.hidden=!allCourses.length;
    catGrid.querySelectorAll('.cat-card').forEach(x=>x.classList.toggle('active',x.dataset.cat===cat));

    const n=list.length;
    resultCount.textContent=cat?`${cat}: ${toBn(n)}টি কোর্স`:`মোট ${toBn(n)}টি কোর্স`;
  }
  function catSkelHtml(){return `<div class="cat-card-skel"><span class="skel-icon"></span><span class="skel-lines"><span class="skel-line big"></span><span class="skel-line small"></span></span></div>`}
  function courseSkelHtml(){return `<div class="course-card-skel"><span class="skel-img"></span><span class="skel-top"><span class="skel-pill"></span></span><span class="skel-body"><span class="skel-line title"></span><span class="skel-line desc1"></span><span class="skel-line desc2"></span><span class="skel-foot"><span class="skel-price"></span><span class="skel-btn"></span></span></span></div>`}
  // Filter top_this courses for home page
  const coursesSection=document.getElementById('courses');
  const coursesSectionHead=coursesSection ? coursesSection.querySelector('.section-head') : null;

  function setTopThisMode(enabled){
    if(coursesSectionHead) coursesSectionHead.style.display='';
    catGrid.style.display='';
    if(enabled){
      toolbar.hidden=true;
      resultCount.textContent='';
    }
  }

  function renderTopThisOnly(topCourses){
    setTopThisMode(true);

    // Counts are calculated from ALL courses for category cards
    renderCategories();

    // Index page ONLY shows top_this=yes course(s). If none marked, show no cards below.
    if(topCourses.length){
      courseGrid.style.display='';
      courseGrid.innerHTML=topCourses.map(cardHtml).join('');
    }else{
      courseGrid.style.display='none';
      courseGrid.innerHTML='';
    }
  }

  async function loadCourses(){
    errorBox.hidden=true;
    courseGrid.style.display='';
    courseGrid.innerHTML=Array(3).fill(courseSkelHtml()).join('');
    catGrid.innerHTML=Array(6).fill(catSkelHtml()).join('');

    try{
      allCourses=await fetchAllCourseRows();
      // Read ONLY courses explicitly marked top_this=yes/true/1.
      const topCourses=allCourses.filter(c=>c.topThis===true);
      renderTopThisOnly(topCourses);
    }catch(e){
      console.error('Course load failed:',e);
      setTopThisMode(false);
      catGrid.innerHTML='<div class="course-empty">ক্যাটাগরি লোড করা যায়নি।</div>';
      courseGrid.innerHTML='';
      toolbar.hidden=true;
      errorBox.hidden=false;
    }
  }

  retryBtn.addEventListener('click',loadCourses);
  loadCourses();
})();

// Course availability check before details navigation
(function(){
  const clean = v => String(v ?? '').trim();
  const availabilityCache = new Map();

  // Check single course availability
  async function courseHasClassData(courseName){
    if(!courseName) return false;
    if(availabilityCache.has(courseName)) return availabilityCache.get(courseName);
    let available = false;
    try{
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(), 12000);
      try{
        const r = await fetch(VISION_API, {
          method:'POST',
          headers:{'Content-Type':'text/plain;charset=utf-8'},
          body: JSON.stringify({ action:'get_course_availability', courseName }),
          signal:controller.signal
        });
        if(r.ok){
          const json = await r.json();
          available = json.status === 'ok' && json.available === true;
        }
      } finally {
        clearTimeout(timeout);
      }
    }catch(e){
      console.error('Class availability check failed:', e);
    }
    availabilityCache.set(courseName, available);
    return available;
  }

  document.addEventListener('click', function(e){
    const link = e.target.closest('.course-details-trigger');
    if(!link) return;
    e.preventDefault();
    if(link.dataset.checking === '1') return;

    const courseName = link.dataset.courseName || '';
    if(link.dataset.hasSubjects === '0'){
      vaShowToast('Upcoming');
      return;
    }
    const href = link.getAttribute('href');
    // Save original text for bfcache
    if(!link.dataset.originalText) link.dataset.originalText = link.textContent;
    link.dataset.checking = '1';
    link.style.opacity = '.6';
    link.textContent = 'যাচাই হচ্ছে...';

    courseHasClassData(courseName).then(available=>{
      if(available){
        window.location.href = href;
        return;
      }
      vaShowToast('Upcoming');
      link.textContent = link.dataset.originalText || link.textContent;
      link.style.opacity = '';
      delete link.dataset.checking;
    });
  });

  // Reset button state on bfcache restore
  window.addEventListener('pageshow', function(e){
    if(!e.persisted) return;
    document.querySelectorAll('.course-details-trigger[data-checking="1"]').forEach(function(link){
      delete link.dataset.checking;
      link.style.opacity = '';
      if(link.dataset.originalText) link.textContent = link.dataset.originalText;
    });
  });
})();

// Dynamic free classes
(function(){
  const pillRow = document.getElementById('videoPillRow');
  const videoGrid = document.getElementById('videoGrid');
  let videos = [];
  let activeCategory = '';

  const clean = v => String(v ?? '').trim();
  const esc = v => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function youtubeId(url){
    const x = clean(url);
    if(!x) return '';
    const patterns = [
      /[?&]v=([A-Za-z0-9_-]{11})/i,
      /youtu\.be\/([A-Za-z0-9_-]{11})/i,
      /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/i,
      /youtube(?:-nocookie)?\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
      /youtube(?:-nocookie)?\.com\/live\/([A-Za-z0-9_-]{11})/i
    ];
    for(const re of patterns){
      const m = x.match(re);
      if(m) return m[1];
    }
    // Support direct 11-char ID
    return /^[A-Za-z0-9_-]{11}$/.test(x) ? x : '';
  }

  async function fetchVideos(){
    await ensureCacheValid();
    const cached = vaGetCache('va_free_videos');
    if(cached && cached.length) return cached;

    const r = await fetch(VISION_API, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ action:'get_free_classes' })
    });
    if(!r.ok) throw Error(`Free Class: HTTP ${r.status}`);
    const j = await r.json();
    if(j.status === 'error') throw Error(j.message || 'Free Class API error');
    const list = (j.data || []).map(row => {
      const category = clean(row.category);
      const title = clean(row.title);
      const url = clean(row.url);
      const id = youtubeId(url);
      if(!category || !title || !id) return null;
      return {category, title, url, id};
    }).filter(Boolean);
    vaSetCache('va_free_videos', list);
    return list;
  }

  function renderPills(){
    // Unique categories
    const seenCategories = new Map();
    videos.forEach(v => {
      const key = normalizeForMatch(v.category);
      if(key && !seenCategories.has(key)) seenCategories.set(key, v.category);
    });
    const categories = [...seenCategories.values()];
    if(!categories.length){
      pillRow.innerHTML = '<div class="video-data-state">এখনো কোনো Free Class যোগ করা হয়নি।</div>';
      return;
    }
    if(!activeCategory || !categories.some(c => normalizeForMatch(c) === normalizeForMatch(activeCategory))) activeCategory = categories[0];
    pillRow.innerHTML = categories.map((cat, i) =>
      `<button class="pill${normalizeForMatch(cat) === normalizeForMatch(activeCategory) ? ' active' : ''}" data-vcat="${esc(cat)}">${esc(cat)}</button>`
    ).join('');
  }

  function cardHtml(v){
    return `<div class="video-card" data-vcategory="${esc(v.category)}">
      <div class="video-thumb" data-yid="${esc(v.id)}" role="button" tabindex="0" aria-label="${esc(v.title)} ভিডিও চালান">
        <img src="https://img.youtube.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt="${esc(v.title)}" loading="lazy">
        <div class="video-play-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      </div>
      <div class="video-title">${esc(v.title)}</div>
    </div>`;
  }

  function bindVideoPlayers(){
    videoGrid.querySelectorAll('.video-thumb').forEach(thumbEl => {
      const play = () => {
        const id = thumbEl.dataset.yid;
        if(!id || thumbEl.querySelector('iframe')) return;
        thumbEl.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0" title="video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      };
      thumbEl.addEventListener('click', play);
      thumbEl.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); play(); }
      });
    });
  }

  function renderVideos(){
    const list = videos.filter(v => normalizeForMatch(v.category) === normalizeForMatch(activeCategory));
    videoGrid.innerHTML = list.length
      ? list.map(cardHtml).join('')
      : '<div class="video-data-state">এই বিভাগে এখনো কোনো Free Class নেই।</div>';
    bindVideoPlayers();
  }

  pillRow.addEventListener('click', e => {
    const btn = e.target.closest('.pill');
    if(!btn) return;
    activeCategory = btn.dataset.vcat;
    pillRow.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p === btn));
    renderVideos();
  });

  async function loadFreeClasses(){
    pillRow.innerHTML = '<div class="video-data-loading">ভিডিও বিভাগ লোড হচ্ছে...</div>';
    videoGrid.innerHTML = '<div class="video-data-loading">ফ্রি ক্লাসের ভিডিও লোড হচ্ছে...</div>';
    try{
      videos = await fetchVideos();
      renderPills();
      renderVideos();
    }catch(e){
      console.error(e);
      pillRow.innerHTML = '<div class="video-data-state">ভিডিও বিভাগ লোড করা যায়নি।</div>';
      videoGrid.innerHTML = '<div class="video-data-state">ইন্টারনেট কানেকশন চেক করুন।</div>';
    }
  }

  loadFreeClasses();
})();

function updateNavProfileButton(){
  const loginBtn=document.getElementById('navLoginBtn');
  if(!loginBtn) return;
  try{
    const raw=localStorage.getItem('va_user');
    if(raw){
      const user=JSON.parse(raw);
      const fullName=String(user?.name||'').trim();
      let displayName='প্রোফাইল',initial='',hasName=false;
      if(fullName){
        hasName=true;
        const titleRx=/^(md\.?|mohammad|muhammad|mst\.?|most\.?|sk\.?|sheikh|মোছাঃ|মোঃ|মুহাম্মদ|শেখ)$/i;
        const rawParts=fullName.split(/\s+/).filter(Boolean);
        const clean=rawParts.filter(p=>!titleRx.test(p));
        const primary=clean.length>0?clean[0]:(rawParts[0]||fullName);
        displayName=primary.length>10?primary.slice(0,9)+'…':primary;
        initial=primary.charAt(0).toUpperCase();
      }
      let hash=0;
      for(let i=0;i<fullName.length;i++){hash=(hash<<5)-hash+fullName.charCodeAt(i);hash|=0;}
      const grads=['linear-gradient(135deg,#0ea5e9,#2563eb)','linear-gradient(135deg,#6366f1,#8b5cf6)','linear-gradient(135deg,#10b981,#059669)','linear-gradient(135deg,#f59e0b,#d97706)','linear-gradient(135deg,#ec4899,#be185d)','linear-gradient(135deg,#06b6d4,#0284c7)','linear-gradient(135deg,#8b5cf6,#d946ef)','linear-gradient(135deg,#f97316,#ea580c)','linear-gradient(135deg,#14b8a6,#0f766e)','linear-gradient(135deg,#ef4444,#b91c1c)'];
      const grad=grads[Math.abs(hash)%grads.length];
      loginBtn.classList.add('nav-cta--logged-in');
      loginBtn.title=fullName?fullName+' (প্রোফাইল)':'আমার প্রোফাইল';
      const avatarContent=hasName&&initial?`<span class="nav-profile-initial">${initial}</span>`:`<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
      loginBtn.innerHTML=`<div class="nav-profile-avatar" style="background:${grad}">${avatarContent}<span class="nav-profile-badge" aria-hidden="true"></span></div><span class="nav-profile-name">${displayName}</span><svg class="nav-profile-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>`;
    }else{
      loginBtn.classList.remove('nav-cta--logged-in');
      loginBtn.title='লগইন করুন';
      loginBtn.innerHTML=`<svg class="nav-login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span>লগইন</span>`;
    }
  }catch(e){}
}
updateNavProfileButton();
window.addEventListener('storage',updateNavProfileButton);

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

  // Initial state check
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
