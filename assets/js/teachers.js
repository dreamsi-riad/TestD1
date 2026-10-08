const VISION_API="https://late-forest-4748.dreamsicreation.workers.dev";
const normalize=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g,' ').replace(/\s+/g,' ').trim();
const clean=v=>String(v??'').trim();
const esc=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bn='০১২৩৪৫৬৭৮৯',en='0123456789';
const toBn=v=>String(v??'').replace(/[0-9]/g,d=>bn[en.indexOf(d)]);

function imageUrl(v){
  const x=clean(v);
  const f=x.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  const i=x.match(/[?&]id=([^&]+)/i);
  if(f)return `https://drive.google.com/thumbnail?id=${f[1]}&sz=w1000`;
  if(x.includes('drive.google.com')&&i)return `https://drive.google.com/thumbnail?id=${i[1]}&sz=w1000`;
  return x;
}
function slugify(v){
  return clean(v).toLowerCase().replace(/&/g,' and ')
    .replace(/[^a-z0-9\u0980-\u09ff]+/g,'-').replace(/^-+|-+$/g,'')||'course';
}
function uniqueSlug(name,cat,used){
  const base=slugify(name), cp=slugify(cat);
  let slug=base;
  if(used.has(slug)) slug=`${cp}-${base}`;
  let n=2;
  while(used.has(slug)) slug=`${cp}-${base}-${n++}`;
  used.add(slug);
  return slug;
}
function parseFeatures(v){return clean(v).split(/[,،]/).map(clean).filter(Boolean)}
function formatPrice(v){
  const x = clean(v);
  if(!x || x === '-') return '';
  if (/\bfree\b/i.test(x)) return x;
  return /[৳$€£]/.test(x) ? toBn(x) : `৳${toBn(x)}`;
}
function initials(name){
  return esc(clean(name).slice(0,1).toUpperCase()||'?');
}

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

async function fetchTeachers(){
  await ensureCacheValid();
  const cached = vaGetCache('va_teachers_list');
  if(cached && cached.length) return cached;

  const r=await fetch(VISION_API,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'get_teachers'})
  });
  if(!r.ok)throw Error(`Teachers: HTTP ${r.status}`);
  const j=await r.json();
  if(j.status==='error')throw Error(j.message||'Teachers API error');
  const list = (j.data||[]).map(row=>{
    const name=clean(row.name);
    if(!name)return null;
    return{
      name,
      photo:imageUrl(row.photo),
      subject:clean(row.subject),
      designation:clean(row.designation)
    };
  }).filter(Boolean);
  vaSetCache('va_teachers_list', list);
  return list;
}

async function fetchCourses(){
  await ensureCacheValid();
  const cached = vaGetCache('va_courses');
  if(cached && cached.length) return cached;

  const r = await fetch(VISION_API,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'get_courses'})
  });
  if(!r.ok) throw Error(`Course Name: HTTP ${r.status}`);
  const j = await r.json();
  if(j.status === 'error') throw Error(j.message || 'Course Name API error');

  const used = new Set();
  const list = (j.data || []).map(row=>{
    const category = clean(row.level), name = clean(row.name);
    if(!category || !name) return null;
    const topThisRaw = String(row.topThisRaw ?? row.topThis ?? row.top_this ?? '').trim().toLowerCase();
    const topThis = ['yes','true','1'].includes(topThisRaw) || row.topThis === true;
    return {
      name,
      category,
      tag: clean(row.tag),
      image: imageUrl(row.image),
      shortDescription: clean(row.shortDescription),
      longDescription: clean(row.longDescription),
      price: formatPrice(row.price),
      oldPrice: formatPrice(row.oldPrice),
      priceNote: clean(row.priceNote),
      features: parseFeatures(row.featureText),
      teachers: clean(row.teachers),
      teacherNames: parseFeatures(row.teachers),
      subjectList: clean(row.subjectList || row.subject_list),
      slug: uniqueSlug(name, category, used),
      topThis,
      topThisRaw
    };
  }).filter(Boolean);
  vaSetCache('va_courses', list);
  return list;
}

let allTeachers=[];
let allCourses=[];

function teacherCardHtml(t){
  return `
  <article class="teacher-card" data-teacher="${esc(t.name)}" tabindex="0" role="button" aria-label="${esc(t.name)}-এর কোর্স দেখুন">
    <div class="teacher-photo-wrap">
      ${t.photo ? `<img class="teacher-photo" src="${esc(t.photo)}" alt="${esc(t.name)}" loading="lazy">`
        : `<div class="teacher-photo" style="display:flex;align-items:center;justify-content:center;font-family:'Baloo Da 2',sans-serif;font-weight:700;font-size:48px;color:#93C5FD;background:linear-gradient(135deg,#1E293B,#0F172A)">${initials(t.name)}</div>`}
      ${t.subject ? `
      <div class="subject-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
        ${esc(t.subject)}
      </div>` : ''}
    </div>
    <div class="teacher-card-body">
      <div>
        <h3 class="teacher-name">${esc(t.name)}</h3>
        <p class="teacher-designation">${esc(t.designation || 'ফ্যাকাল্টি মেম্বার')}</p>
      </div>
      <div class="teacher-action-row">
        <span class="teacher-cta-text">কোর্সসমূহ দেখুন</span>
        <span class="teacher-action-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
          </svg>
        </span>
      </div>
    </div>
  </article>`;
}

function renderTeachers(list = allTeachers){
  const grid=document.getElementById('teacherGrid');
  const badge=document.getElementById('teacherCountBadge');
  
  if(badge){
    badge.textContent = `মোট ${toBn(list.length)} জন শিক্ষক`;
  }

  if(!list.length){
    grid.innerHTML=`
      <div class="teacher-data-state">
        <svg style="width:48px;height:48px;color:#94A3B8;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <p style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:4px;">কোনো শিক্ষক পাওয়া যায়নি</p>
        <p style="font-size:14px;color:var(--ink-muted);">অন্য কোনো নাম বা বিষয় দিয়ে সার্চ করার চেষ্টা করুন।</p>
      </div>`;
    return;
  }
  grid.innerHTML=list.map(teacherCardHtml).join('');
}

async function loadAll(){
  const grid=document.getElementById('teacherGrid');
  try{
    [allTeachers,allCourses]=await Promise.all([fetchTeachers(),fetchCourses().catch(()=>[])]);
    renderTeachers(allTeachers);
  }catch(e){
    console.error(e);
    grid.innerHTML='<div class="teacher-data-state">শিক্ষকদের তথ্য লোড করা যায়নি। ইন্টারনেট কানেকশন চেক করে রিলোড দিন।</div>';
  }
}

// Search filter
const searchInput = document.getElementById('teacherSearchInput');
if(searchInput){
  searchInput.addEventListener('input', e=>{
    const q = normalize(e.target.value);
    if(!q){
      renderTeachers(allTeachers);
      return;
    }
    const filtered = allTeachers.filter(t => {
      const name = normalize(t.name);
      const subj = normalize(t.subject);
      const des = normalize(t.designation);
      return name.includes(q) || subj.includes(q) || des.includes(q);
    });
    renderTeachers(filtered);
  });
}

// Teacher modal
const overlay=document.getElementById('teacherModalOverlay');
const tmPhoto=document.getElementById('tmPhoto');
const tmName=document.getElementById('tmName');
const tmDesignation=document.getElementById('tmDesignation');
const tmSubject=document.getElementById('tmSubject');
const tmCourseList=document.getElementById('tmCourseList');
const tmCourseCount=document.getElementById('tmCourseCount');

function courseRowHtml(c){
  const priceHtml=c.price?`<span class="tm-course-price">${esc(c.price)}</span>`:'';
  return `
  <a class="tm-course-row" href="course-details.html?course=${encodeURIComponent(c.slug)}">
    ${c.image?`<img class="tm-course-thumb" src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy">`:'<div class="tm-course-thumb"></div>'}
    <div class="tm-course-meta">
      <div class="tm-course-name">${esc(c.name)}</div>
      <div class="tm-course-cat">${esc(c.category)}${c.tag?` • ${esc(c.tag)}`:''}</div>
    </div>
    ${priceHtml}
    <svg class="tm-course-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  </a>`;
}

function openTeacherModal(name){
  const teacher=allTeachers.find(t=>t.name===name);
  if(!teacher)return;

  if(teacher.photo){
    tmPhoto.src=teacher.photo;
    tmPhoto.style.display='';
  } else {
    tmPhoto.style.display='none';
  }
  tmPhoto.alt=teacher.name;
  tmName.textContent=teacher.name;
  tmDesignation.textContent=teacher.designation||'ফ্যাকাল্টি মেম্বার';
  
  if(teacher.subject){
    tmSubject.innerHTML=`<svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>${esc(teacher.subject)}`;
    tmSubject.style.display='';
  } else {
    tmSubject.style.display='none';
  }

  const key=normalize(teacher.name);
  const matched=allCourses.filter(c=>(c.teacherNames||[]).some(n=>normalize(n)===key));

  if(tmCourseCount){
    tmCourseCount.textContent = `${toBn(matched.length)}টি কোর্স`;
  }

  tmCourseList.innerHTML=matched.length
    ? matched.map(courseRowHtml).join('')
    : '<div class="tm-empty">এই শিক্ষকের জন্য এখনো কোনো কোর্স তালিকাভুক্ত করা হয়নি।</div>';

  overlay.classList.add('open');
  document.body.style.overflow='hidden';
}

function closeTeacherModal(){
  overlay.classList.remove('open');
  document.body.style.overflow='';
}

document.getElementById('teacherGrid').addEventListener('click',e=>{
  const card=e.target.closest('.teacher-card');
  if(!card)return;
  openTeacherModal(card.dataset.teacher);
});
document.getElementById('teacherGrid').addEventListener('keydown',e=>{
  if(e.key!=='Enter' && e.key!==' ')return;
  const card=e.target.closest('.teacher-card');
  if(!card)return;
  e.preventDefault();
  openTeacherModal(card.dataset.teacher);
});
document.getElementById('teacherModalClose').addEventListener('click',closeTeacherModal);
overlay.addEventListener('click',e=>{ if(e.target===overlay) closeTeacherModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && overlay.classList.contains('open')) closeTeacherModal(); });

// Mobile nav toggle
document.getElementById('burgerBtn').addEventListener('click',()=>{
  document.getElementById('navLinks').classList.toggle('open');
});
document.querySelectorAll('#navLinks a').forEach(a=>{
  a.addEventListener('click',()=>document.getElementById('navLinks').classList.remove('open'));
});

// Profile button state
function updateNavProfileButton(){
  const loginBtn=document.getElementById('navLoginBtn');
  if(!loginBtn) return;
  try{
    const raw=localStorage.getItem('va_user');
    if(raw){
      const user=JSON.parse(raw);
      const fullName=String(user?.name||'').trim();
      let displayName='প্রোফাইল';
      let initial='';
      let hasName=false;

      if(fullName){
        hasName=true;
        const titleRegex=/^(md\.?|mohammad|muhammad|mst\.?|most\.?|sk\.?|sheikh|মোছাঃ|মোঃ|মোঃ|মুহাম্মদ|শেখ)$/i;
        const rawParts=fullName.split(/\s+/).filter(Boolean);
        const cleanParts=rawParts.filter(p=>!titleRegex.test(p));
        const primary=cleanParts.length>0?cleanParts[0]:(rawParts[0]||fullName);
        displayName=primary;
        if(displayName.length>10){
          displayName=displayName.slice(0,9)+'…';
        }
        initial=primary.charAt(0).toUpperCase();
      }

      let hash=0;
      for(let i=0;i<fullName.length;i++){
        hash=(hash<<5)-hash+fullName.charCodeAt(i);
        hash|=0;
      }
      const grads=[
        'linear-gradient(135deg, #0ea5e9, #2563eb)',
        'linear-gradient(135deg, #6366f1, #8b5cf6)',
        'linear-gradient(135deg, #10b981, #059669)',
        'linear-gradient(135deg, #f59e0b, #d97706)',
        'linear-gradient(135deg, #ec4899, #be185d)',
        'linear-gradient(135deg, #06b6d4, #0284c7)',
        'linear-gradient(135deg, #8b5cf6, #d946ef)',
        'linear-gradient(135deg, #f97316, #ea580c)',
        'linear-gradient(135deg, #14b8a6, #0f766e)',
        'linear-gradient(135deg, #ef4444, #b91c1c)'
      ];
      const grad=grads[Math.abs(hash)%grads.length];

      loginBtn.classList.add('nav-cta--logged-in');
      loginBtn.title=fullName?fullName+' (প্রোফাইল)':'আমার প্রোফাইল';

      const avatarContent=hasName&&initial
        ? `<span class="nav-profile-initial">${initial}</span>`
        : `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;

      loginBtn.innerHTML=`<div class="nav-profile-avatar" style="background:${grad}">${avatarContent}<span class="nav-profile-badge" aria-hidden="true"></span></div><span class="nav-profile-name">${displayName}</span><svg class="nav-profile-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>`;
    }else{
      loginBtn.classList.remove('nav-cta--logged-in');
      loginBtn.title='লগইন করুন';
      loginBtn.innerHTML=`<svg class="nav-login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span>লগইন</span>`;
    }
  }catch(e){}
}

document.addEventListener('DOMContentLoaded',()=>{
  updateNavProfileButton();
  loadAll();
});
window.addEventListener('storage', updateNavProfileButton);



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
