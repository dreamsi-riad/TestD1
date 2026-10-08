const VISION_API = "https://late-forest-4748.dreamsicreation.workers.dev";
const clean = v => String(v ?? '').trim();
const esc = v => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizeForMatch = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ').replace(/\s+/g, ' ').trim();
const bnDigits = '০১২৩৪৫৬৭৮৯', enDigits = '0123456789';
const toBn = v => String(v ?? '').replace(/[0-9]/g, d => bnDigits[enDigits.indexOf(d)]);
const priceDisplay = v => { const x = clean(v); if(!x) return ''; return /[৳$€£]/.test(x) ? toBn(x) : `৳${toBn(x)}`; };

const ALL_LEVELS = ['SSC','HSC','BBA','MBA','BBS','BBA Professional'];
const DEPT_YEAR_LEVELS = ['BBA','MBA','BBS','BBA Professional'];
const DEPARTMENTS = ['Accounting','Management','Marketing','Finance'];
const YEARS = ['1st Year','2nd Year','3rd Year','4th Year'];

const SW_COURSE_PREFIX = 'SW::';
function buildSubjectWiseCourseId(row){
  const sector = String(row.nuDcu || '').trim().toUpperCase();
  return sector
    ? `${SW_COURSE_PREFIX}${row.level}::${row.department || ''}::${row.year || ''}::${sector}::${row.subject}`
    : `${SW_COURSE_PREFIX}${row.level}::${row.department || ''}::${row.year || ''}::${row.subject}`;
}

let allSubjectRows = [];

function getEnrolledSubjectWiseIds(){
  try{
    const raw = localStorage.getItem('va_user');
    if(!raw) return new Set();
    const user = JSON.parse(raw);
    const courses = Array.isArray(user?.courses) ? user.courses : [];
    return new Set(courses.map(c => normalizeForMatch(c?.name)).filter(Boolean));
  }catch(e){ return new Set(); }
}
const enrolledSubjectWiseIds = getEnrolledSubjectWiseIds();
function imageUrl(v){
  const x = clean(v);
  const f = x.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  const i = x.match(/[?&]id=([^&]+)/i);
  if(f) return `https://drive.google.com/thumbnail?id=${f[1]}&sz=w1000`;
  if(x.includes('drive.google.com') && i) return `https://drive.google.com/thumbnail?id=${i[1]}&sz=w1000`;
  return x;
}
const parseFeatures = v => clean(v).split(/[,،、\n\r]/).map(clean).filter(Boolean);

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

async function fetchSubjectWiseRows(){
  await ensureCacheValid();
  const cached = vaGetCache('va_sw_courses');
  if(cached && cached.length) return cached;

  const r = await fetch(VISION_API, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ action:'get_subjectwise_courses' })
  });
  if(!r.ok) throw new Error(`Subjectwise Course Name: HTTP ${r.status}`);
  const j = await r.json();
  if(j.status === 'error') throw new Error(j.message || 'Subjectwise Course Name API error');
  const rows = (j.data || [])
    .map(row => ({
      level: clean(row.level),
      year: clean(row.year),
      department: clean(row.department),
      subject: clean(row.subjectName ?? row.subject_name),
      description: clean(row.description),
      newPrice: clean(row.newPrice ?? row.new_price),
      oldPrice: clean(row.oldPrice ?? row.old_price),
      image: imageUrl(row.imageUrl ?? row.image_url),
      nuDcu: clean(row.nuDcu ?? row.nu_dcu).toUpperCase(),
      teachers: clean(row.teachers),
      teacherNames: parseFeatures(row.teachers)
    }))
    .filter(row => row.level && row.subject);

  vaSetCache('va_sw_courses', rows);
  return rows;
}

function populateLevelSelect(){
  const sel = document.getElementById('levelSelect');
  const present = new Set(allSubjectRows.map(r => r.level));
  ALL_LEVELS.forEach(lvl => {
    if(!present.has(lvl)) return;
    const opt = document.createElement('option');
    opt.value = lvl;
    opt.textContent = lvl;
    sel.appendChild(opt);
  });
}
function populateFixedSelect(id, values, placeholder){
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">${esc(placeholder)}</option>` +
    values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

function cardHtml(row){
  const metaBits = [];
  if(row.department) metaBits.push(`<span>${esc(row.department)}</span>`);
  if(row.year) metaBits.push(`<span>${esc(row.year)}</span>`);
  const courseId = buildSubjectWiseCourseId(row);
  const isEnrolled = enrolledSubjectWiseIds.has(normalizeForMatch(courseId));
  const actionHtml = isEnrolled
    ? `<a href="student-login.html" class="ps-enroll-btn ps-enrolled">
        <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
        ভর্তি হয়েছেন ✓
      </a>`
    : `<button type="button" class="ps-enroll-btn" data-course-id="${esc(courseId)}">
        এনরোল ও বিস্তারিত
        <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      </button>`;

  return `<article class="ps-card">
    ${row.image ? `<img class="ps-card-img" src="${esc(row.image)}" alt="${esc(row.subject)}" loading="lazy">` : ''}
    <div class="ps-card-body">
      <div class="ps-card-top">
        <h3>${esc(row.subject)}</h3>
        <span class="ps-pill-group">
          <span class="ps-level-pill">${esc(row.level)}</span>
          ${row.nuDcu ? `<span class="ps-sector-pill">${esc(row.nuDcu)}</span>` : ''}
        </span>
      </div>
      ${metaBits.length ? `<div class="ps-meta">${metaBits.join('')}</div>` : ''}
      <div class="ps-price-row">
        ${row.newPrice ? `<span class="ps-price">${priceDisplay(row.newPrice)}</span>` : ''}
        ${row.oldPrice ? `<span class="ps-price-old">${priceDisplay(row.oldPrice)}</span>` : ''}
      </div>
      ${row.description ? `<p class="ps-desc">${esc(row.description)}</p>` : ''}
      ${actionHtml}
    </div>
  </article>`;
}

function currentFilteredRows(){
  const level = document.getElementById('levelSelect').value;
  if(!level) return null;

  let rows = allSubjectRows.filter(r => r.level === level);

  if(DEPT_YEAR_LEVELS.includes(level)){
    const dept = document.getElementById('deptSelect').value;
    const year = document.getElementById('yearSelect').value;
    if(!dept || !year) return [];
    rows = rows.filter(r => normalizeForMatch(r.department) === normalizeForMatch(dept) && normalizeForMatch(r.year) === normalizeForMatch(year));
  }

  const q = normalizeForMatch(document.getElementById('subjectSearch').value);
  if(q) rows = rows.filter(r => normalizeForMatch(r.subject).includes(q));

  return rows;
}

function render(){
  const level = document.getElementById('levelSelect').value;
  const deptYearRow = document.getElementById('deptYearRow');
  const searchWrap = document.getElementById('searchWrap');
  const resultsArea = document.getElementById('resultsArea');

  if(!level){
    deptYearRow.classList.remove('show');
    searchWrap.classList.remove('show');
    resultsArea.innerHTML = `<div class="ps-status" id="promptState"><strong>শুরু করতে উপরে লেভেল সিলেক্ট করুন</strong>কোর্স দেখতে প্রথমে একটি লেভেল বেছে নিন।</div>`;
    return;
  }

  const needsDeptYear = DEPT_YEAR_LEVELS.includes(level);
  deptYearRow.classList.toggle('show', needsDeptYear);

  const rows = currentFilteredRows();

  if(rows === null){
    resultsArea.innerHTML = `<div class="ps-status"><strong>লেভেল সিলেক্ট করুন</strong></div>`;
    return;
  }

  if(needsDeptYear){
    const dept = document.getElementById('deptSelect').value;
    const year = document.getElementById('yearSelect').value;
    if(!dept || !year){
      searchWrap.classList.remove('show');
      resultsArea.innerHTML = `<div class="ps-status"><strong>ডিপার্টমেন্ট ও ইয়ার সিলেক্ট করুন</strong>এই লেভেলের কোর্স দেখতে দুটোই বেছে নিতে হবে।</div>`;
      return;
    }
  }

  searchWrap.classList.add('show');

  if(!rows.length){
    resultsArea.innerHTML = `<div class="ps-status"><strong>কোনো কোর্স পাওয়া যায়নি</strong>এই ফিল্টারে এখনো কোনো সাবজেক্ট যোগ করা হয়নি।</div>`;
    return;
  }

  resultsArea.innerHTML = `<p class="ps-count">মোট ${toBn(rows.length)}টি কোর্স পাওয়া গেছে</p><div class="ps-grid">${rows.map(cardHtml).join('')}</div>`;
}

document.getElementById('resultsArea').addEventListener('click', (e) => {
  const btn = e.target.closest('.ps-enroll-btn');
  if(!btn) return;
  const courseId = btn.dataset.courseId;
  if(!courseId) return;
  window.location.href = `course-details.html?sw=${encodeURIComponent(courseId)}`;
});

document.getElementById('levelSelect').addEventListener('change', () => {
  document.getElementById('deptSelect').value = '';
  document.getElementById('yearSelect').value = '';
  document.getElementById('subjectSearch').value = '';
  render();
});
document.getElementById('deptSelect').addEventListener('change', render);
document.getElementById('yearSelect').addEventListener('change', render);
document.getElementById('subjectSearch').addEventListener('input', render);

function updateSubjectSchema(rows){
  try{
    const script = document.getElementById('subjectSchemaJson');
    if(!script || !rows || !rows.length) return;
    const topRows = rows.slice(0, 16);
    const itemList = {
      "@type": "ItemList",
      "name": "BBA VISION Subject-wise Courses",
      "description": "BBA, HSC, BBS ও MBA-এর অ্যাকাউন্টিং, ফিন্যান্স, ম্যানেজমেন্ট ও মার্কেটিং-এর বিষয়ভিত্তিক পূর্ণাঙ্গ অনলাইন কোর্সসমূহ",
      "url": "https://visionplusbd.com/per-subject.html",
      "numberOfItems": topRows.length,
      "itemListElement": topRows.map((r, idx) => {
        const swId = buildSubjectWiseCourseId(r);
        const url = `https://visionplusbd.com/course-details.html?sw=${encodeURIComponent(swId)}`;
        const cleanPrice = String(r.newPrice || '').replace(/[^0-9.]/g, '');
        const isFree = !cleanPrice || Number(cleanPrice) === 0 || /\bfree\b/i.test(String(r.newPrice || ''));
        return {
          "@type": "ListItem",
          "position": idx + 1,
          "url": url,
          "item": {
            "@type": "Course",
            "name": `${r.subject} (${r.level}${r.department ? ' - ' + r.department : ''})`,
            "description": r.description || `${r.subject} — ${r.level} বিষয়ের পূর্ণাঙ্গ অনলাইন প্রস্তুতি কোর্স।`,
            "url": url,
            "image": r.image || "https://visionplusbd.com/og-image.jpg",
            "provider": {
              "@type": "EducationalOrganization",
              "name": "BBA VISION | VISION Plus",
              "sameAs": "https://visionplusbd.com/"
            },
            "hasCourseInstance": {
              "@type": "CourseInstance",
              "courseMode": "online",
              "courseWorkload": "PT60H"
            },
            "offers": {
              "@type": "Offer",
              "category": isFree ? "Free" : "Paid",
              "price": isFree ? "0" : (cleanPrice || "0"),
              "priceCurrency": "BDT",
              "availability": "https://schema.org/InStock"
            }
          }
        };
      })
    };
    const schemaData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://visionplusbd.com/" },
            { "@type": "ListItem", "position": 2, "name": "Subject-wise Courses", "item": "https://visionplusbd.com/per-subject.html" }
          ]
        },
        itemList
      ]
    };
    script.textContent = JSON.stringify(schemaData);
  }catch(e){
    console.error('Subject schema update error:', e);
  }
}

async function init(){
  populateFixedSelect('deptSelect', DEPARTMENTS, 'ডিপার্টমেন্ট নির্বাচন করুন');
  populateFixedSelect('yearSelect', YEARS, 'ইয়ার নির্বাচন করুন');
  try{
    allSubjectRows = await fetchSubjectWiseRows();
    if(!allSubjectRows.length){
      document.getElementById('resultsArea').innerHTML = `<div class="ps-status"><strong>এখনো কোনো সাবজেক্ট যোগ করা হয়নি</strong>শীঘ্রই নতুন সাবজেক্ট যোগ করা হবে।</div>`;
      return;
    }
    updateSubjectSchema(allSubjectRows);
    populateLevelSelect();
  }catch(e){
    console.error('Subject wise data load failed:', e);
    document.getElementById('resultsArea').innerHTML = `<div class="ps-status"><strong>ডেটা লোড করা যায়নি</strong>ইন্টারনেট কানেকশন চেক করে আবার চেষ্টা করুন।</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const burger = document.getElementById('burgerBtn');
  const nav = document.getElementById('navLinks');
  if(burger && nav) burger.addEventListener('click', () => nav.classList.toggle('open'));
  if(nav) nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));

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
          const cleanParts=rawParts.filter(p=>!titleRx.test(p));
          const primary=cleanParts.length>0?cleanParts[0]:(rawParts[0]||fullName);
          displayName=primary.length>10?primary.slice(0,9)+'…':primary;
          initial=primary.charAt(0).toUpperCase();
        }
        let hash=0;
        for(let i=0;i<fullName.length;i++){hash=(hash<<5)-hash+fullName.charCodeAt(i);hash|=0;}
        const grads=['linear-gradient(135deg,#0ea5e9,#2563eb)','linear-gradient(135deg,#6366f1,#8b5cf6)','linear-gradient(135deg,#10b981,#059669)','linear-gradient(135deg,#f59e0b,#d97706)','linear-gradient(135deg,#ec4899,#be185d)'];
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

  init();
});



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
