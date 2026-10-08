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
  const x=clean(v);
  if(!x || x === '-')return '';
  if(/\bfree\b/i.test(x)) return x;
  return /[৳$€£]/.test(x)?toBn(x):`৳${toBn(x)}`;
}

function extractBbaYear(title){
  const cleanTitle = clean(title);
  const m = cleanTitle.match(/\b(1st|2nd|3rd|4th)\b[\s-]*\b(yr|year)s?\b/i) || cleanTitle.match(/\b(1st|2nd|3rd|4th)\b/i);
  if(!m)return '';
  const map={'1st':'1st Year','2nd':'2nd Year','3rd':'3rd Year','4th':'4th Year'};
  return map[m[1].toLowerCase()]||'';
}

const UNIVERSITY_ALIASES={
  nu:'nu national university national জাতীয় বিশ্ববিদ্যালয়',
  dcu:'dcu dhaka central university central 7 college seven ঢাকা কলেজ'
};

function courseSearchText(c){
  const catNorm=normalize(c.category);
  const nameNorm=normalize(c.name);
  const tagNorm=normalize(c.tag);
  let uniAlias='';
  if(catNorm.includes('nu') || nameNorm.includes('(nu)') || tagNorm === 'nu'){
    uniAlias += ' ' + UNIVERSITY_ALIASES.nu;
  }
  if(catNorm.includes('dcu') || nameNorm.includes('(dcu)') || tagNorm === 'dcu'){
    uniAlias += ' ' + UNIVERSITY_ALIASES.dcu;
  }
  return normalize([
    c.category,
    c.name,
    c.tag,
    uniAlias,
    extractBbaYear(c.name)
  ].join(' '));
}

function matchesSearch(c,query){
  const q=normalize(query);
  if(!q)return true;
  const text=courseSearchText(c);
  return q.split(' ').filter(Boolean).every(token=>text.includes(token));
}

function isSubjectWiseTag(tag){
  const t=normalize(tag);
  return t.includes('subject wise')||t.includes('improvement');
}

function getEnrolledCourseKeys(){
  try{
    const raw=localStorage.getItem('va_user');
    if(!raw)return new Set();
    const user=JSON.parse(raw);
    const courses=Array.isArray(user?.courses)?user.courses:[];
    return new Set(
      courses.map(c=>normalize(c?.name)).filter(Boolean)
    );
  }catch(e){return new Set()}
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

async function fetchCourses(){
  await ensureCacheValid();
  const cached = vaGetCache('va_courses');
  if(cached && cached.length) return cached;

  const r = await fetch(VISION_API, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'get_courses'})
  });
  if(!r.ok) throw Error(`Course Name: HTTP ${r.status}`);
  const j = await r.json();
  if(j.status==='error') throw Error(j.message||'Course Name API error');

  const used = new Set();
  const list = (j.data||[]).map(row=>{
    const category = clean(row.level), name = clean(row.name);
    if(!category || !name) return null;
    const topThisRaw = String(row.topThisRaw ?? row.topThis ?? row.top_this ?? '').trim().toLowerCase();
    const topThis = ['yes','true','1'].includes(topThisRaw);
    return {
      name,
      tag:clean(row.tag),
      image:imageUrl(row.image),
      shortDescription:clean(row.shortDescription),
      longDescription:clean(row.longDescription),
      price:formatPrice(row.price),
      oldPrice:formatPrice(row.oldPrice),
      priceNote:clean(row.priceNote),
      features:parseFeatures(row.featureText),
      teachers:clean(row.teachers),
      teacherNames:parseFeatures(row.teachers),
      subjectList:clean(row.subjectList || row.subject_list),
      category,
      slug:uniqueSlug(name,category,used),
      topThis,
      topThisRaw
    };
  }).filter(Boolean);
  vaSetCache('va_courses', list);
  return list;
}

function cardHtml(c,enrolledKeys){
  const colors={
    SSC:'#2563EB',HSC:'#059669',BBA:'#C026D3','BBA NU':'#C026D3','BBA DCU':'#C026D3',
    MBA:'#7C3AED',BBS:'#EA580C','BBA Professional':'#E11D48'
  };
  const color=colors[c.category]||'#2563EB';
  const enrolled=enrolledKeys.has(normalize(c.name));

  let actionHtml;
  if(enrolled){
    actionHtml='<a href="student-login.html" class="btn btn-primary course-enrolled-trigger">ভর্তি হয়েছেন ✓</a>';
  }else if(isSubjectWiseTag(c.tag)){
    actionHtml='<a href="per-subject.html" class="btn btn-primary">বিস্তারিত</a>';
  }else{
    actionHtml=`<a href="course-details.html?course=${encodeURIComponent(c.slug)}" data-course-name="${esc(c.name)}" data-has-subjects="${c.subjectList ? '1' : '0'}" class="btn btn-primary course-details-trigger">বিস্তারিত</a>`;
  }

  return `
  <article class="course-card">
    <img class="course-image" src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy">
    <div class="course-top">
      <span class="course-category" style="color:${color}">${esc(c.category)}</span>
      ${c.tag?`<span class="course-tag">${esc(c.tag)}</span>`:''}
    </div>
    <div class="course-body">
      <h3>${esc(c.name)}</h3>
      <p>${esc(c.shortDescription)}</p>
      <div class="course-foot">
        <div class="price">
          <div class="price-row">
            ${c.price?`<span class="price-now">${esc(c.price)}</span>`:''}
            ${c.oldPrice?`<span class="price-old">${esc(c.oldPrice)}</span>`:''}
          </div>
          ${c.priceNote?`<small>${esc(c.priceNote)}</small>`:''}
        </div>
        ${actionHtml}
      </div>
    </div>
  </article>`;
}

let allCourses=[];

let selectedUniversity='';
let selectedYear='';
let searchQuery='';

const VALID_LEVELS=['SSC','HSC','BBA','MBA','BBS','BBA Professional','BBA NU','BBA DCU'];
const requestedLevel=new URLSearchParams(window.location.search).get('level');
let initialUniversity = '';
let requestedLevelMatch = '';

if(requestedLevel){
  const reqNorm = normalize(requestedLevel);
  if(reqNorm === 'bba nu' || reqNorm === 'nu'){
    requestedLevelMatch = 'BBA';
    initialUniversity = 'nu';
  } else if(reqNorm === 'bba dcu' || reqNorm === 'dcu'){
    requestedLevelMatch = 'BBA';
    initialUniversity = 'dcu';
  } else {
    const m = VALID_LEVELS.find(x => normalize(x) === reqNorm);
    if(m) requestedLevelMatch = m.startsWith('BBA ') ? 'BBA' : m;
  }
}
let activeLevel = requestedLevelMatch || 'ALL';
selectedUniversity = initialUniversity;

function updateBbaFilterVisibility(){
  const bar=document.getElementById('bbaFilterBar');
  bar.style.display=(normalize(activeLevel)===normalize('BBA'))?'flex':'none';
}

function updateSearchBarVisibility(){
  const bar=document.getElementById('courseSearchBar');
  const isAll=activeLevel==='ALL';
  bar.style.display=isAll?'block':'none';
  if(!isAll){
    searchQuery='';
    const input=document.getElementById('courseSearchInput');
    if(input)input.value='';
  }
}

function render(){
  const grid=document.getElementById('courseGrid');
  const enrolled=getEnrolledCourseKeys();
  const isBbaLevel = normalize(activeLevel) === 'bba';
  let list = activeLevel === 'ALL'
    ? allCourses
    : allCourses.filter(c => {
        if (isBbaLevel) {
          const catNorm = normalize(c.category);
          return catNorm === 'bba' || catNorm === 'bba nu' || catNorm === 'bba dcu' || (catNorm.startsWith('bba') && !catNorm.includes('pro'));
        }
        return normalize(c.category) === normalize(activeLevel);
      });

  if (isBbaLevel) {
    if (selectedUniversity) {
      const selNorm = normalize(selectedUniversity);
      list = list.filter(c => {
        const rawName = clean(c.name).toLowerCase();
        const tagNorm = normalize(c.tag);
        const catNorm = normalize(c.category);
        const nameNorm = normalize(c.name);
        const nameTokens = nameNorm.split(' ').filter(Boolean);
        return tagNorm === selNorm ||
               catNorm.includes(selNorm) ||
               rawName.includes(`(${selNorm})`) ||
               rawName.includes(`-${selNorm}`) ||
               nameTokens.includes(selNorm) ||
               (selNorm === 'nu' && (rawName.includes('national') || rawName.includes('জাতীয়'))) ||
               (selNorm === 'dcu' && (rawName.includes('central') || rawName.includes('7 college') || rawName.includes('seven')));
      });
    }
    if (selectedYear) {
      const selYrNorm = normalize(selectedYear);
      list = list.filter(c => {
        const extracted = normalize(extractBbaYear(c.name));
        if (extracted && (extracted === selYrNorm || extracted.includes(selYrNorm.split(' ')[0]))) return true;
        const rawLower = clean(c.name).toLowerCase();
        if (selYrNorm.includes('1st') && (rawLower.includes('1st') || rawLower.includes('১ম'))) return true;
        if (selYrNorm.includes('2nd') && (rawLower.includes('2nd') || rawLower.includes('২য়') || rawLower.includes('২য়'))) return true;
        if (selYrNorm.includes('3rd') && (rawLower.includes('3rd') || rawLower.includes('৩য়') || rawLower.includes('৩য়'))) return true;
        if (selYrNorm.includes('4th') && (rawLower.includes('4th') || rawLower.includes('৪র্থ'))) return true;
        return false;
      });
    }
  }

  if(activeLevel==='ALL' && searchQuery.trim()){
    list=list.filter(c=>matchesSearch(c,searchQuery));
  }

  if(!list.length){
    if(searchQuery.trim()){
      grid.innerHTML='<div class="course-empty"><strong>কোনো কোর্স খুঁজে পাওয়া যায়নি</strong></div>';
    } else {
      grid.innerHTML='<div class="course-empty"><strong style="font-size:20px;margin-bottom:0;">Upcoming</strong></div>';
    }
    return;
  }
  grid.innerHTML=list.map(c=>cardHtml(c,enrolled)).join('');
}

function updateAllCoursesSchema(courses){
  try{
    const script = document.getElementById('allCoursesSchemaJson');
    if(!script || !courses || !courses.length) return;
    const itemList = {
      "@type": "ItemList",
      "name": "BBA VISION Online Courses",
      "description": "BBA, HSC, BBS, MBA ও BBA Professional-এর পূর্ণাঙ্গ অনলাইন কোর্সসমূহ",
      "url": "https://visionplusbd.com/All_Courses.html",
      "numberOfItems": courses.length,
      "itemListElement": courses.map((c, idx) => {
        const url = `https://visionplusbd.com/course-details.html?course=${encodeURIComponent(c.slug || slugify(c.name))}`;
        const cleanPrice = String(c.price || '').replace(/[^0-9.]/g, '');
        const isFree = !cleanPrice || Number(cleanPrice) === 0 || /\bfree\b/i.test(String(c.price || ''));
        return {
          "@type": "ListItem",
          "position": idx + 1,
          "url": url,
          "item": {
            "@type": "Course",
            "name": c.name,
            "description": c.shortDescription || c.longDescription || `${c.name} — BBA VISION ও VISION Plus-এর পূর্ণাঙ্গ অনলাইন প্রস্তুতি কোর্স।`,
            "url": url,
            "image": c.image || "https://visionplusbd.com/og-image.jpg",
            "provider": {
              "@type": "EducationalOrganization",
              "name": "BBA VISION | VISION Plus",
              "sameAs": "https://visionplusbd.com/"
            },
            "hasCourseInstance": {
              "@type": "CourseInstance",
              "courseMode": "online"
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
            { "@type": "ListItem", "position": 2, "name": "All Courses", "item": "https://visionplusbd.com/All_Courses.html" }
          ]
        },
        itemList
      ]
    };
    script.textContent = JSON.stringify(schemaData);
  }catch(e){
    console.error('All courses schema update error:', e);
  }
}

async function loadCourses(){
  const grid=document.getElementById('courseGrid');
  try{
    allCourses=await fetchCourses();
    updateAllCoursesSchema(allCourses);
    render();
  }catch(e){
    console.error(e);
    grid.innerHTML='<div class="status"><strong>কোর্সের তথ্য লোড করা যায়নি।</strong><br>ইন্টারনেট কানেকশন চেক করে আবার চেষ্টা করুন।</div>';
  }
}

window.addEventListener('pageshow',(event)=>{
  activeLevel=requestedLevelMatch||'ALL';
  selectedUniversity=initialUniversity||'';
  selectedYear='';
  const uSel=document.getElementById('bbaUniversitySelect');
  const ySel=document.getElementById('bbaYearSelect');
  if(uSel) uSel.value=selectedUniversity;
  if(ySel) ySel.value='';
  document.querySelectorAll('.level-btn').forEach(x=>{
    x.classList.toggle('active',normalize(x.dataset.level)===normalize(activeLevel));
    x.blur();
  });
  updateBbaFilterVisibility();
  updateSearchBarVisibility();
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();

  if(allCourses && allCourses.length){
    render();
  }else{
    loadCourses();
  }
  window.scrollTo(0,0);
});

document.getElementById('levelBar').addEventListener('click',e=>{
  const btn=e.target.closest('.level-btn');
  if(!btn || btn.classList.contains('subject-wise-nav'))return;
  const prevLevel=activeLevel;
  activeLevel=btn.dataset.level;
  document.querySelectorAll('.level-btn').forEach(x=>x.classList.toggle('active',x===btn));
  if(normalize(activeLevel)===normalize('BBA') && normalize(prevLevel)!==normalize('BBA')){
    selectedUniversity='';
    selectedYear='';
    const uSel=document.getElementById('bbaUniversitySelect');
    const ySel=document.getElementById('bbaYearSelect');
    if(uSel) uSel.value='';
    if(ySel) ySel.value='';
  }
  updateBbaFilterVisibility();
  updateSearchBarVisibility();
  render();
});

document.getElementById('courseSearchInput').addEventListener('input',e=>{
  searchQuery=e.target.value;
  render();
});

document.getElementById('bbaUniversitySelect').addEventListener('change',e=>{
  selectedUniversity=e.target.value;
  render();
});
document.getElementById('bbaYearSelect').addEventListener('change',e=>{
  selectedYear=e.target.value;
  render();
});

document.getElementById('burgerBtn').addEventListener('click',()=>{
  document.getElementById('navLinks').classList.toggle('open');
});
document.querySelectorAll('#navLinks a').forEach(a=>{
  a.addEventListener('click',()=>document.getElementById('navLinks').classList.remove('open'));
});

document.addEventListener('DOMContentLoaded',()=>{
  selectedUniversity=initialUniversity||'';
  selectedYear='';
  const uSel=document.getElementById('bbaUniversitySelect');
  const ySel=document.getElementById('bbaYearSelect');
  if(uSel) uSel.value=selectedUniversity;
  if(ySel) ySel.value='';
  document.querySelectorAll('.level-btn').forEach(x=>{
    x.classList.toggle('active',normalize(x.dataset.level)===normalize(activeLevel));
  });
  updateBbaFilterVisibility();
  updateSearchBarVisibility();
  updateNavProfileButton();
  loadCourses();
});

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
      const grads=[
        'linear-gradient(135deg,#0ea5e9,#2563eb)',
        'linear-gradient(135deg,#6366f1,#8b5cf6)',
        'linear-gradient(135deg,#10b981,#059669)',
        'linear-gradient(135deg,#f59e0b,#d97706)',
        'linear-gradient(135deg,#ec4899,#be185d)'
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
window.addEventListener('storage',updateNavProfileButton);

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

(function(){
  const availabilityCache = new Map();

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

  window.addEventListener('pageshow', function(e){
    if(!e.persisted) return;
    document.querySelectorAll('.course-details-trigger[data-checking="1"]').forEach(function(link){
      delete link.dataset.checking;
      link.style.opacity = '';
      if(link.dataset.originalText) link.textContent = link.dataset.originalText;
    });
  });
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
