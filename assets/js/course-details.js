// ============================================================
        // Course details loader — Cloudflare Worker + D1 (action=get_courses)
        // ============================================================
        const VISION_API = "https://late-forest-4748.dreamsicreation.workers.dev";
        const bnDigits = '০১২৩৪৫৬৭৮৯', enDigits = '0123456789';
        const clean = v => String(v ?? '').trim();
        const escapeHtml = v => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const normalizeTextForMatch = v => clean(v).toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ').replace(/\s+/g, ' ').trim();
        const toBn = v => String(v ?? '').replace(/[0-9]/g, d => bnDigits[enDigits.indexOf(d)]);
        const normalizeImageUrl = v => {
            const x = clean(v), f = x.match(/drive\.google\.com\/file\/d\/([^/]+)/i), i = x.match(/[?&]id=([^&]+)/i);
            if(f) return `https://drive.google.com/thumbnail?id=${f[1]}&sz=w1000`;
            if(x.includes('drive.google.com') && i) return `https://drive.google.com/thumbnail?id=${i[1]}&sz=w1000`;
            return x;
        };
        const slugify = v => clean(v).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\u0980-\u09ff]+/g, '-').replace(/^-+|-+$/g, '') || 'course';
        function uniqueSlug(name, cat, used) {
            const base = slugify(name), cp = slugify(cat);
            let slug = base;
            if(used.has(slug)) slug = `${cp}-${base}`;
            let n = 2;
            while(used.has(slug)) slug = `${cp}-${base}-${n++}`;
            used.add(slug);
            return slug;
        }
        const parseFeatures = v => clean(v).split(/[,،]/).map(clean).filter(Boolean);
        const formatPrice = v => {
            const x = clean(v);
            if(!x || x === '-') return '';
            if (/\bfree\b/i.test(x)) return x;
            return /[৳$€£]/.test(x) ? toBn(x) : `৳${toBn(x)}`;
        };
        function formatInlineText(text) {
            let s = escapeHtml(text);
            // Markdown bold: **text** or __text__
            s = s.replace(/\*\*(.+?)\*\*/g, '<strong class="desc-bold">$1</strong>');
            s = s.replace(/__(.+?)__/g, '<strong class="desc-bold">$1</strong>');
            // Safe HTML bold tags if passed
            s = s.replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gi, '<strong class="desc-bold">$1</strong>');
            s = s.replace(/&lt;strong&gt;(.*?)&lt;\/strong&gt;/gi, '<strong class="desc-bold">$1</strong>');
            // Safe highlight tag/markdown: ==text== or <mark>
            s = s.replace(/==(.+?)==/g, '<mark class="desc-highlight">$1</mark>');
            s = s.replace(/&lt;mark&gt;(.*?)&lt;\/mark&gt;/gi, '<mark class="desc-highlight">$1</mark>');
            return s;
        }
        function formatDescription(desc) {
            const raw = clean(desc);
            if(!raw) return '<p class="desc-para">এই কোর্সের বিস্তারিত তথ্য শীঘ্রই আপডেট করা হবে।</p>';
            const lines = raw.split(/\r?\n/);
            let html = '';
            lines.forEach(rawLine => {
                const line = clean(rawLine);
                if(!line) {
                    html += '<div class="desc-gap"></div>';
                    return;
                }
                const isBullet = /^(?:[•▪♦◆▶\u25C6\u25C7\u25BA\u25B6🔹⭐🎯⚡🎁💡]|[\-\*]\s+)/.test(line);
                if(isBullet) {
                    html += `<div class="desc-bullet-line">${formatInlineText(line)}</div>`;
                } else {
                    html += `<p class="desc-para">${formatInlineText(line)}</p>`;
                }
            });
            return html;
        }
        function getCourseSlug() { return new URLSearchParams(window.location.search).get('course'); }
        function getSwId() { return new URLSearchParams(window.location.search).get('sw'); }

        // Get enrolled courses
        function getEnrolledCourseNames() {
            try {
                const raw = localStorage.getItem('va_user');
                if(!raw) return new Set();
                const user = JSON.parse(raw);
                const courses = Array.isArray(user?.courses) ? user.courses : [];
                const s = new Set();
                courses.forEach(c => {
                    const n = normalizeTextForMatch(c?.name);
                    if(n) s.add(n);
                });
                return s;
            } catch(e) {
                return new Set();
            }
        }

        const SW_COURSE_PREFIX = 'SW::';
        function buildSubjectWiseCourseId(row) {
            const sector = String(row.nuDcu || '').trim().toUpperCase();
            return sector
                ? `${SW_COURSE_PREFIX}${row.level}::${row.department || ''}::${row.year || ''}::${sector}::${row.subject}`
                : `${SW_COURSE_PREFIX}${row.level}::${row.department || ''}::${row.year || ''}::${row.subject}`;
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

        async function getAllSubjectWiseRows() {
            await ensureCacheValid();
            const cached = vaGetCache('va_sw_courses');
            if(cached && cached.length) return cached;

            const response = await fetch(VISION_API, {
                method: 'POST',
                headers: {'Content-Type': 'text/plain;charset=utf-8'},
                body: JSON.stringify({action: 'get_subjectwise_courses'})
            });
            if(!response.ok) throw Error(`Subjectwise Course Name: HTTP ${response.status}`);
            const json = await response.json();
            if(json.status === 'error') throw Error(json.message || 'Subjectwise Course Name API error');
            const data = (json.data || []).map(row => ({
                level: clean(row.level),
                year: clean(row.year),
                department: clean(row.department),
                subject: clean(row.subjectName ?? row.subject_name),
                description: clean(row.description),
                newPrice: clean(row.newPrice ?? row.new_price),
                oldPrice: clean(row.oldPrice ?? row.old_price),
                image: normalizeImageUrl(row.imageUrl ?? row.image_url),
                nuDcu: clean(row.nuDcu ?? row.nu_dcu).toUpperCase(),
                teachers: clean(row.teachers),
                teacherNames: clean(row.teachers).split(/[,،、\n\r]/).map(clean).filter(Boolean)
            })).filter(row => row.level && row.subject);
            vaSetCache('va_sw_courses', data);
            return data;
        }

        async function getAllTeachers() {
            await ensureCacheValid();
            const cached = vaGetCache('va_teachers_list');
            if(cached && cached.length) return cached;

            const response = await fetch(VISION_API, {
                method: 'POST',
                headers: {'Content-Type': 'text/plain;charset=utf-8'},
                body: JSON.stringify({action: 'get_teachers'})
            });
            if(!response.ok) throw Error(`Teachers: HTTP ${response.status}`);
            const json = await response.json();
            if(json.status === 'error') throw Error(json.message || 'Teachers API error');
            const data = (json.data || []).map(row => {
                const name = clean(row.name);
                if(!name) return null;
                return {name, photo: normalizeImageUrl(row.photo), subject: clean(row.subject), designation: clean(row.designation)};
            }).filter(Boolean);
            vaSetCache('va_teachers_list', data);
            return data;
        }

        async function getAllCourses() {
            await ensureCacheValid();
            const cached = vaGetCache('va_courses');
            if(cached && cached.length) return cached;

            const response = await fetch(VISION_API, {
                method: 'POST',
                headers: {'Content-Type': 'text/plain;charset=utf-8'},
                body: JSON.stringify({action: 'get_courses'})
            });
            if(!response.ok) throw Error(`Course Name: HTTP ${response.status}`);
            const json = await response.json();
            if(json.status === 'error') throw Error(json.message || 'Course Name API error');
            const used = new Set();
            const data = (json.data || []).map(row => {
                const level = clean(row.level), name = clean(row.name);
                if(!level || !name) return null;
                const topThisRaw = String(row.topThisRaw ?? row.topThis ?? row.top_this ?? '').trim().toLowerCase();
                const topThis = ['yes','true','1'].includes(topThisRaw) || row.topThis === true;
                return {
                    name,
                    category: level,
                    tag: clean(row.tag),
                    image: normalizeImageUrl(row.image),
                    shortDescription: clean(row.shortDescription),
                    longDescription: clean(row.longDescription),
                    price: formatPrice(row.price),
                    oldPrice: formatPrice(row.oldPrice),
                    priceNote: clean(row.priceNote),
                    features: parseFeatures(row.featureText),
                    teachers: clean(row.teachers),
                    teacherNames: parseFeatures(row.teachers),
                    subjectList: clean(row.subjectList || row.subject_list),
                    slug: uniqueSlug(name, level, used),
                    topThis,
                    topThisRaw
                };
            }).filter(Boolean);
            vaSetCache('va_courses', data);
            return data;
        }

        function updateCourseSchema(c, teachers = []) {
            try {
                let script = document.getElementById('courseSchemaJson');
                if (!script) {
                    script = document.createElement('script');
                    script.id = 'courseSchemaJson';
                    script.type = 'application/ld+json';
                    document.head.appendChild(script);
                }
                const name = c.name || c.subject || 'Course Details';
                const cleanPrice = String(c.price || c.newPrice || '').replace(/[^0-9.]/g, '');
                const isFree = !cleanPrice || Number(cleanPrice) === 0 || /\bfree\b/i.test(String(c.price || c.newPrice || ''));
                const validInstructors = (teachers || []).filter(t => t && t.name).map(t => {
                    const inst = {
                        "@type": "Person",
                        "name": t.name
                    };
                    if (t.photo) inst.image = t.photo;
                    if (t.designation) inst.jobTitle = t.designation;
                    return inst;
                });
                const courseInstance = {
                    "@type": "CourseInstance",
                    "courseMode": "online"
                };
                if (validInstructors.length > 0) {
                    courseInstance.instructor = validInstructors;
                }
                const schemaData = {
                    "@context": "https://schema.org",
                    "@graph": [
                        {
                            "@type": "BreadcrumbList",
                            "itemListElement": [
                                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://visionplusbd.com/" },
                                { "@type": "ListItem", "position": 2, "name": "All Courses", "item": "https://visionplusbd.com/All_Courses" },
                                { "@type": "ListItem", "position": 3, "name": name, "item": window.location.href }
                            ]
                        },
                        {
                            "@type": "Course",
                            "name": name,
                            "description": c.shortDescription || c.longDescription || c.description || `${name} — BBA VISION ও VISION Plus-এর পূর্ণাঙ্গ অনলাইন প্রস্তুতি কোর্স।`,
                            "url": window.location.href,
                            "image": c.image || "https://visionplusbd.com/og-image.jpg",
                            "provider": {
                                "@type": "EducationalOrganization",
                                "name": "BBA VISION | VISION Plus",
                                "sameAs": "https://visionplusbd.com/"
                            },
                            "hasCourseInstance": courseInstance,
                            "offers": {
                                "@type": "Offer",
                                "category": isFree ? "Free" : "Paid",
                                "price": isFree ? "0" : (cleanPrice || "0"),
                                "priceCurrency": "BDT",
                                "availability": "https://schema.org/InStock"
                            }
                        }
                    ]
                };
                script.textContent = JSON.stringify(schemaData);
            } catch(e) {
                console.error('Schema update error:', e);
            }
        }

        function renderCourse(course, teachers) {
            const loadingState = document.getElementById('loadingState');
            const content = document.getElementById('courseContent');
            loadingState.style.display = 'none';
            if(!course) {
                content.innerHTML = `
                    <div class="not-found">
                        <h2>😕 কোর্সটি খুঁজে পাওয়া যায়নি</h2>
                        <p>আপনি যে কোর্সটি খুঁজছেন, সেটি খুঁজে পাওয়া যায়নি বা সরানো হয়েছে।</p>
                        <a href="All_Courses.html" class="btn btn-primary enroll-btn">সব কোর্স দেখুন</a>
                    </div>`;
                content.style.display = 'block';
                return;
            }
            document.title = `${course.name} | VISION Plus`;
            const description = course.longDescription || course.shortDescription || 'এই কোর্সের বিস্তারিত তথ্য শীঘ্রই আপডেট করা হবে।';
            
            // Render features
            const featuresHtml = course.features.length ? `
                <div class="detail-features-wrap">
                    <span class="detail-features-title">কোর্সের বিশেষ সুবিধা:</span>
                    <ul class="detail-features">
                        ${course.features.map(f => `
                            <li>
                                <span class="detail-feature-check">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                </span>
                                <span>${escapeHtml(f)}</span>
                            </li>`).join('')}
                    </ul>
                </div>` : '';
            
            const image = course.image || '';

            // Match course instructors
            const matchedTeachers = (course.teacherNames || []).map(n => {
                const key = normalizeTextForMatch(n);
                return teachers.find(t => normalizeTextForMatch(t.name) === key) || {name: n, photo: '', subject: '', designation: ''};
            });
            const initials = name => escapeHtml(clean(name).slice(0, 1).toUpperCase() || '?');

            let courseInstructorsHtml = '';
            if(matchedTeachers.length) {
                courseInstructorsHtml = `
                    <div class="course-instructors-box">
                        <div class="instructors-box-header">
                            <span class="instructors-box-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
                                </svg>
                                কোর্স ইন্সট্রাক্টর
                            </span>
                        </div>
                        <div class="instructors-list">
                            ${matchedTeachers.map(t => `
                                <div class="instructor-card-item">
                                    ${t.photo
                                        ? `<img src="${escapeHtml(t.photo)}" alt="${escapeHtml(t.name)}" class="instructor-card-avatar" loading="lazy">`
                                        : `<div class="instructor-card-initials">${initials(t.name)}</div>`
                                    }
                                    <div class="instructor-card-info">
                                        <h4 class="instructor-card-name">${escapeHtml(t.name)}</h4>
                                        <p class="instructor-card-desig">${escapeHtml(t.designation || 'ফ্যাকাল্টি মেম্বার')}</p>
                                        ${t.subject ? `<span class="instructor-card-subject">${escapeHtml(t.subject)}</span>` : ''}
                                    </div>
                                </div>`).join('')}
                        </div>
                    </div>`;
            }

            // Check enrollment
            const enrolledSet = getEnrolledCourseNames();
            const isFree = /\bfree\b/i.test(String(course.price || ''));
            const isEnrolled = enrolledSet.has(normalizeTextForMatch(course.name));
            const isUpcoming = !clean(course.subjectList);

            let enrollButtonHtml = '';
            if(isUpcoming) {
                enrollButtonHtml = `
                    <button type="button" class="btn btn-primary enroll-btn" style="background:#64748b;cursor:not-allowed;" onclick="vaShowToast('Upcoming')">
                        Upcoming
                    </button>`;
            } else if(isEnrolled) {
                enrollButtonHtml = `
                    <a href="student-login.html" class="btn course-enrolled-trigger">
                        <svg viewBox="0 0 20 20" fill="currentColor" style="width:19px;height:19px;">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                        ভর্তি হয়েছেন ✓
                    </a>`;
            } else {
                enrollButtonHtml = `
                    <a href="student-login.html?enroll=${encodeURIComponent(course.name)}${isFree ? '&free=1' : ''}" class="btn btn-primary enroll-btn">
                        Enroll Now
                        <svg viewBox="0 0 20 20" fill="currentColor" style="width:18px;height:18px;">
                            <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                        </svg>
                    </a>`;
            }

            content.innerHTML = `
                <div class="course-detail-grid">
                    <!-- বাম পাশ: হেডার (টাইটেল + ব্যাজ), ইমেজ, প্রাইস, কোর্স সুবিধা ও বাটন -->
                    <div class="detail-left-col">
                        <div class="detail-header-block">
                            <div class="detail-eyebrow-row">
                                <span class="detail-category-badge">${escapeHtml(course.category)}${course.tag ? ` ${escapeHtml(course.tag)}` : ''}</span>
                                ${course.tag ? `<span class="detail-tag">${escapeHtml(course.tag)}</span>` : ''}
                            </div>
                            <h1 class="detail-title">${escapeHtml(course.name)}</h1>
                        </div>

                        <div class="detail-image-box">
                            ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(course.name)}" loading="eager">` : '<div style="aspect-ratio:16/10;background:#1e293b;display:flex;align-items:center;justify-content:center;color:#94a3b8">Course Image</div>'}
                        </div>

                        <div class="detail-price-card">
                            <div class="detail-price-main">
                                ${course.price ? `<span class="price-now">${escapeHtml(course.price)}</span>` : '<span class="price-now">Free</span>'}
                                ${course.oldPrice ? `<span class="price-old">${escapeHtml(course.oldPrice)}</span>` : ''}
                                ${course.oldPrice ? `<span class="price-discount-tag">অফার প্রাইস</span>` : ''}
                            </div>
                            ${course.priceNote ? `
                                <div class="price-note">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    <span>${escapeHtml(course.priceNote)}</span>
                                </div>` : ''}
                        </div>

                        <!-- কোর্স ইন্সট্রাক্টর তথ্য (কোর্সের সুবিধার উপরে) -->
                        ${courseInstructorsHtml}

                        <!-- কোর্সের বিশেষ সুবিধা -->
                        ${featuresHtml}

                        <div class="detail-actions">
                            ${enrollButtonHtml}
                            <button type="button" class="btn btn-outline" id="howToBuyBtn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/>
                                </svg>
                                <span>কোর্সটি যেভাবে কিনবেন</span>
                            </button>
                        </div>
                    </div>

                    <!-- ডান পাশ: বিস্তারিত বিবরণ (Long Description) -->
                    <div class="detail-right-col">
                        <div class="detail-description-card">
                            ${formatDescription(description)}
                        </div>
                    </div>
                </div>`;
            content.style.display = 'block';
            updateCourseSchema(course, matchedTeachers);
        }

        // Render subject-wise course
        function renderSubjectWiseCourse(row, teachers = []) {
            const loadingState = document.getElementById('loadingState');
            const content = document.getElementById('courseContent');
            loadingState.style.display = 'none';
            if(!row) {
                content.innerHTML = `
                    <div class="not-found">
                        <h2>😕 সাবজেক্টটি খুঁজে পাওয়া যায়নি</h2>
                        <p>আপনি যেটি খুঁজছেন, সেটি খুঁজে পাওয়া যায়নি।</p>
                        <a href="per-subject.html" class="btn btn-primary enroll-btn">সব সাবজেক্ট দেখুন</a>
                    </div>`;
                content.style.display = 'block';
                return;
            }
            document.title = `${row.subject} | VISION Plus`;
            const description = row.description || 'এই সাবজেক্টের বিস্তারিত তথ্য শীঘ্রই আপডেট করা হবে।';
            const image = row.image || '';
            const courseId = buildSubjectWiseCourseId(row);
            const metaBits = [row.department, row.year].filter(Boolean).map(escapeHtml).join(' • ');

            // Instructor details
            const initials = name => escapeHtml(clean(name).slice(0, 1).toUpperCase() || '?');
            const teacherNames = row.teacherNames && row.teacherNames.length ? row.teacherNames : (row.teachers ? parseFeatures(row.teachers) : []);
            const matchedTeachers = teacherNames.map(n => {
                const key = normalizeTextForMatch(n);
                return teachers.find(t => normalizeTextForMatch(t.name) === key) || {name: n, photo: '', subject: '', designation: ''};
            });

            let swInstructorsHtml = '';
            if(matchedTeachers.length) {
                swInstructorsHtml = `
                    <div class="course-instructors-box">
                        <div class="instructors-box-header">
                            <span class="instructors-box-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
                                </svg>
                                কোর্স ইন্সট্রাক্টর
                            </span>
                        </div>
                        <div class="instructors-list">
                            ${matchedTeachers.map(t => `
                                <div class="instructor-card-item">
                                    ${t.photo
                                        ? `<img src="${escapeHtml(t.photo)}" alt="${escapeHtml(t.name)}" class="instructor-card-avatar" loading="lazy">`
                                        : `<div class="instructor-card-initials">${initials(t.name)}</div>`
                                    }
                                    <div class="instructor-card-info">
                                        <h4 class="instructor-card-name">${escapeHtml(t.name)}</h4>
                                        <p class="instructor-card-desig">${escapeHtml(t.designation || 'ফ্যাকাল্টি মেম্বার')}</p>
                                        ${t.subject ? `<span class="instructor-card-subject">${escapeHtml(t.subject)}</span>` : ''}
                                    </div>
                                </div>`).join('')}
                        </div>
                    </div>`;
            }

            // Check enrollment
            const enrolledSet = getEnrolledCourseNames();
            const swSector = normalizeTextForMatch(row.nuDcu);
            const isFree = /\bfree\b/i.test(String(row.newPrice || ''));
            const isEnrolled = swSector
                ? (enrolledSet.has(`${normalizeTextForMatch(row.subject)}::${swSector}`) || enrolledSet.has(`${normalizeTextForMatch(courseId)}::${swSector}`))
                : (enrolledSet.has(`${normalizeTextForMatch(row.subject)}::`) || enrolledSet.has(normalizeTextForMatch(row.subject)) ||
                   enrolledSet.has(`${normalizeTextForMatch(courseId)}::`) || enrolledSet.has(normalizeTextForMatch(courseId)));

            let enrollButtonHtml = '';
            if(isEnrolled) {
                enrollButtonHtml = `
                    <a href="student-login.html" class="btn course-enrolled-trigger">
                        <svg viewBox="0 0 20 20" fill="currentColor" style="width:19px;height:19px;">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                        ভর্তি হয়েছেন ✓
                    </a>`;
            } else {
                enrollButtonHtml = `
                    <a href="student-login.html?enroll=${encodeURIComponent(courseId)}${isFree ? '&free=1' : ''}" class="btn btn-primary enroll-btn">
                        Enroll Now
                        <svg viewBox="0 0 20 20" fill="currentColor" style="width:18px;height:18px;">
                            <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                        </svg>
                    </a>`;
            }

            content.innerHTML = `
                <div class="course-detail-grid">
                    <!-- বাম পাশ: হেডার, ইমেজ, প্রাইস ও বাটন -->
                    <div class="detail-left-col">
                        <div class="detail-header-block">
                            <div class="detail-eyebrow-row">
                                <span class="detail-category-badge">${escapeHtml(row.level)}${metaBits ? ` • ${metaBits}` : ''}</span>
                                ${row.nuDcu ? `<span class="detail-tag">${escapeHtml(row.nuDcu)}</span>` : ''}
                            </div>
                            <h1 class="detail-title">${escapeHtml(row.subject)}</h1>
                        </div>

                        <div class="detail-image-box">
                            ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(row.subject)}" loading="eager">` : '<div style="aspect-ratio:16/10;background:#1e293b;display:flex;align-items:center;justify-content:center;color:#94a3b8">Subject Image</div>'}
                        </div>

                        <div class="detail-price-card">
                            <div class="detail-price-main">
                                ${row.newPrice ? `<span class="price-now">${escapeHtml(formatPrice(row.newPrice))}</span>` : '<span class="price-now">Free</span>'}
                                ${row.oldPrice ? `<span class="price-old">${escapeHtml(formatPrice(row.oldPrice))}</span>` : ''}
                                ${row.oldPrice ? `<span class="price-discount-tag">অফার প্রাইস</span>` : ''}
                            </div>
                        </div>

                        <!-- কোর্স ইন্সট্রাক্টর তথ্য (কোর্সের সুবিধার উপরে) -->
                        ${swInstructorsHtml}

                        <div class="detail-actions">
                            ${enrollButtonHtml}
                            <button type="button" class="btn btn-outline" id="howToBuyBtn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/>
                                </svg>
                                <span>কোর্সটি যেভাবে কিনবেন</span>
                            </button>
                        </div>
                    </div>

                    <!-- ডান পাশ: বিস্তারিত বিবরণ -->
                    <div class="detail-right-col">
                        <div class="detail-description-card">
                            ${formatDescription(description)}
                        </div>
                    </div>
                </div>`;
            content.style.display = 'block';
            updateCourseSchema({
                name: row.subject,
                description: row.description,
                image: row.image,
                price: row.newPrice || row.oldPrice
            }, matchedTeachers);
        }

        async function loadCourseDetails() {
            const content = document.getElementById('courseContent');
            const slug = clean(getCourseSlug());
            const swId = getSwId();
            try {
                if(swId) {
                    const [rows, teachers] = await Promise.all([getAllSubjectWiseRows(), getAllTeachers().catch(() => [])]);
                    const row = rows.find(r => buildSubjectWiseCourseId(r) === swId);
                    renderSubjectWiseCourse(row, teachers);
                    return;
                }
                const [courses, teachers] = await Promise.all([getAllCourses(), getAllTeachers().catch(() => [])]);
                const course = courses.find(c => c.slug === slug || slugify(c.name) === slugify(slug) || clean(c.name).toLowerCase() === slug.toLowerCase());
                renderCourse(course, teachers);
            } catch(error) {
                console.error('Course details loading failed:', error);
                document.getElementById('loadingState').style.display = 'none';
                content.innerHTML = `
                    <div class="sheet-error">
                        <h2>কোর্সের তথ্য লোড করা যায়নি</h2>
                        <p>ইন্টারনেট কানেকশন চেক করে আবার চেষ্টা করুন।</p>
                        <button class="btn btn-primary enroll-btn" onclick="location.reload()">আবার চেষ্টা করুন</button>
                    </div>`;
                content.style.display = 'block';
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            const burger = document.getElementById('burgerBtn');
            const nav = document.getElementById('navLinks');
            if(burger && nav) burger.addEventListener('click', () => nav.classList.toggle('open'));
            if(nav) nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
            loadCourseDetails();

            // Update profile button
            function updateNavProfileButton() {
                const loginBtn = document.getElementById('navLoginBtn');
                if(!loginBtn) return;
                try {
                    const raw = localStorage.getItem('va_user');
                    if(raw) {
                        const user = JSON.parse(raw);
                        const fullName = String(user?.name || '').trim();
                        let displayName = 'প্রোফাইল', initial = '', hasName = false;
                        if(fullName) {
                            hasName = true;
                            const titleRx = /^(md\.?|mohammad|muhammad|mst\.?|most\.?|sk\.?|sheikh|মোছাঃ|মোঃ|মুহাম্মদ|শেখ)$/i;
                            const rawParts = fullName.split(/\s+/).filter(Boolean);
                            const cleanParts = rawParts.filter(p => !titleRx.test(p));
                            const primary = cleanParts.length > 0 ? cleanParts[0] : (rawParts[0] || fullName);
                            displayName = primary.length > 10 ? primary.slice(0, 9) + '…' : primary;
                            initial = primary.charAt(0).toUpperCase();
                        }
                        let hash = 0;
                        for(let i = 0; i < fullName.length; i++) { hash = (hash << 5) - hash + fullName.charCodeAt(i); hash |= 0; }
                        const grads = [
                            'linear-gradient(135deg,#0ea5e9,#2563eb)',
                            'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            'linear-gradient(135deg,#10b981,#059669)',
                            'linear-gradient(135deg,#f59e0b,#d97706)',
                            'linear-gradient(135deg,#ec4899,#be185d)'
                        ];
                        const grad = grads[Math.abs(hash) % grads.length];
                        loginBtn.classList.add('nav-cta--logged-in');
                        loginBtn.title = fullName ? fullName + ' (প্রোফাইল)' : 'আমার প্রোফাইল';
                        const avatarContent = hasName && initial
                            ? `<span class="nav-profile-initial">${initial}</span>`
                            : `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
                        loginBtn.innerHTML = `
                            <div class="nav-profile-avatar" style="background:${grad}">${avatarContent}<span class="nav-profile-badge" aria-hidden="true"></span></div>
                            <span class="nav-profile-name">${displayName}</span>
                            <svg class="nav-profile-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>`;
                    } else {
                        loginBtn.classList.remove('nav-cta--logged-in');
                        loginBtn.title = 'লগইন করুন';
                        loginBtn.innerHTML = `
                            <svg class="nav-login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
                            <span>লগইন</span>`;
                    }
                } catch(e) {}
            }
            updateNavProfileButton();
            window.addEventListener('storage', updateNavProfileButton);

            // How to buy video modal
            const HOW_TO_BUY_VIDEO_ID = 'e9n3pCPTl8I';
            const videoModalOverlay = document.getElementById('videoModalOverlay');
            const videoModalFrameWrap = document.getElementById('videoModalFrameWrap');
            const videoModalClose = document.getElementById('videoModalClose');

            function openVideoModal() {
                videoModalFrameWrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${HOW_TO_BUY_VIDEO_ID}?autoplay=1&rel=0" title="কোর্সটি যেভাবে কিনবেন" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                videoModalOverlay.classList.add('open');
                document.body.style.overflow = 'hidden';
            }

            function closeVideoModal() {
                videoModalOverlay.classList.remove('open');
                videoModalFrameWrap.innerHTML = '';
                document.body.style.overflow = '';
            }

            document.addEventListener('click', (e) => {
                if(e.target.closest('#howToBuyBtn')) openVideoModal();
            });
            if(videoModalClose) videoModalClose.addEventListener('click', closeVideoModal);
            if(videoModalOverlay) videoModalOverlay.addEventListener('click', (e) => {
                if(e.target === videoModalOverlay) closeVideoModal();
            });
            document.addEventListener('keydown', (e) => {
                if(e.key === 'Escape' && videoModalOverlay.classList.contains('open')) closeVideoModal();
            });
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
