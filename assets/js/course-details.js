// ============================================================
// Course details loader — Cloudflare Worker + D1 (action=get_courses)
// ============================================================
const VISION_API = "https://late-forest-4748.dreamsicreation.workers.dev";
const bnDigits = '০১২৩৪৫৬৭৮৯', enDigits = '0123456789';
const clean = v => String(v ?? '').trim();
const escapeHtml = v => clean(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalizeTextForMatch = v => clean(v).toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ').replace(/\s+/g, ' ').trim();
const toBn = v => String(v ?? '').replace(/[0-9]/g, d => bnDigits[enDigits.indexOf(d)]);
const normalizeImageUrl = v => {
    const x = clean(v), f = x.match(/drive\.google\.com\/file\/d\/([^/]+)/i), i = x.match(/[?&]id=([^&]+)/i);
    if (f) return `https://drive.google.com/thumbnail?id=${f[1]}&sz=w1000`;
    if (x.includes('drive.google.com') && i) return `https://drive.google.com/thumbnail?id=${i[1]}&sz=w1000`;
    return x;
};
const slugify = v => clean(v).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\u0980-\u09ff]+/g, '-').replace(/^-+|-+$/g, '') || 'course';
function uniqueSlug(name, cat, used) {
    const base = slugify(name), cp = slugify(cat);
    let slug = base;
    if (used.has(slug)) slug = `${cp}-${base}`;
    let n = 2;
    while (used.has(slug)) slug = `${cp}-${base}-${n++}`;
    used.add(slug);
    return slug;
}
const parseFeatures = v => clean(v).split(/[,،]/).map(clean).filter(Boolean);
const parseSubjectList = v => clean(v).split(/[,;\n\r、，|]+/).map(clean).filter(Boolean);

// 3D-styled SVG icons generator for syllabus subjects
function getSubject3DIcon(name, uid = 0) {
    const n = String(name || '').toLowerCase().trim();
    const id = 's3d_' + uid + '_' + Math.random().toString(36).slice(2, 7);

    // 1. Taxation / Tax / কর
    if (/tax|ট্যাক্স|কর/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_tx_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#F59E0B"/>
                    <stop offset="60%" stop-color="#D97706"/>
                    <stop offset="100%" stop-color="#9A3412"/>
                </linearGradient>
                <linearGradient id="sh_tx_${id}" x1="0" y1="0" x2="0" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_tx_${id})"/>
            <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_tx_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <rect x="11" y="10" width="22" height="24" rx="3" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1.2"/>
            <line x1="15" y1="15" x2="23" y2="15" stroke="#D97706" stroke-width="1.8" stroke-linecap="round"/>
            <line x1="15" y1="19" x2="29" y2="19" stroke="#92400E" stroke-width="1.3" stroke-linecap="round"/>
            <line x1="15" y1="23" x2="29" y2="23" stroke="#92400E" stroke-width="1.3" stroke-linecap="round"/>
            <circle cx="26" cy="27" r="4.5" fill="#D97706"/>
            <text x="26" y="30" fill="#FEF3C7" font-family="'Baloo Da 2', 'Anek Bangla', sans-serif" font-size="7.5" font-weight="800" text-anchor="middle">৳</text>
        </svg>`;
    }

    // 2. Finance / Banking / Insurance
    if (/financ|ফিন্যান্স|banking|ব্যাংক|insurance|বিমা/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_fn_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#0284C7"/>
                    <stop offset="60%" stop-color="#0369A1"/>
                    <stop offset="100%" stop-color="#075985"/>
                </linearGradient>
                <linearGradient id="sh_fn_${id}" x1="0" y1="0" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_fn_${id})"/>
            <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_fn_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <rect x="10" y="25" width="5" height="8" rx="1.2" fill="#7DD3FC"/>
            <rect x="17" y="19" width="5" height="14" rx="1.2" fill="#BAE6FD"/>
            <rect x="24" y="14" width="5" height="19" rx="1.2" fill="#FFFFFF"/>
            <path d="M11 22L18 16L25 12L32 9" stroke="#FDE047" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M28 9H32V13" stroke="#FDE047" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }

    // 3. Accounting / Auditing / Cost
    if (/account|হিসাব|ledger|cost|audit|নিরীক্ষা/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_ac_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#10B981"/>
                    <stop offset="60%" stop-color="#059669"/>
                    <stop offset="100%" stop-color="#047857"/>
                </linearGradient>
                <linearGradient id="sh_ac_${id}" x1="0" y1="0" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_ac_${id})"/>
            <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_ac_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <rect x="11" y="9" width="22" height="26" rx="4" fill="#064E3B" stroke="#A7F3D0" stroke-width="1.2"/>
            <rect x="14" y="12" width="16" height="6" rx="1.5" fill="#D1FAE5"/>
            <text x="28" y="16.8" fill="#065F46" font-family="monospace" font-size="6" font-weight="bold" text-anchor="end">12,500</text>
            <rect x="14" y="21" width="3.5" height="3" rx="0.8" fill="#FFFFFF"/>
            <rect x="20.2" y="21" width="3.5" height="3" rx="0.8" fill="#FFFFFF"/>
            <rect x="26.5" y="21" width="3.5" height="3" rx="0.8" fill="#FBBF24"/>
            <rect x="14" y="26" width="3.5" height="3" rx="0.8" fill="#FFFFFF"/>
            <rect x="20.2" y="26" width="3.5" height="3" rx="0.8" fill="#FFFFFF"/>
            <rect x="26.5" y="26" width="3.5" height="3" rx="0.8" fill="#34D399"/>
        </svg>`;
    }

    // 4. Bangla
    if (/বাংলা|bengali|\bbangla\b|সাহিত্য/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_bn_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#EF4444"/>
                    <stop offset="60%" stop-color="#DC2626"/>
                    <stop offset="100%" stop-color="#991B1B"/>
                </linearGradient>
                <linearGradient id="sh_bn_${id}" x1="0" y1="0" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_bn_${id})"/>
            <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_bn_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <text x="14" y="19" fill="#FFFFFF" font-family="'Baloo Da 2', 'Anek Bangla', sans-serif" font-size="13" font-weight="800" text-anchor="middle">অ</text>
            <text x="30" y="19" fill="#FEF08A" font-family="'Baloo Da 2', 'Anek Bangla', sans-serif" font-size="13" font-weight="800" text-anchor="middle">আ</text>
            <text x="22" y="34" fill="#FFFFFF" font-family="'Baloo Da 2', 'Anek Bangla', sans-serif" font-size="14.5" font-weight="800" text-anchor="middle">ক</text>
        </svg>`;
    }

    // 5. English / Communication
    if (/ইংরেজি|english|communication/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_en_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#06B6D4"/>
                    <stop offset="60%" stop-color="#0891B2"/>
                    <stop offset="100%" stop-color="#0E7490"/>
                </linearGradient>
                <linearGradient id="bd_en_${id}" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#164E63"/>
                    <stop offset="100%" stop-color="#083344"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_en_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <rect x="7" y="9" width="30" height="22" rx="4" fill="url(#bd_en_${id})" stroke="#FDE68A" stroke-width="1.5"/>
            <path d="M12 31L9 37M32 31L35 37" stroke="#FDE68A" stroke-width="1.8" stroke-linecap="round"/>
            <text x="22" y="24.5" fill="#FFFFFF" font-family="'Baloo Da 2', sans-serif" font-size="11.5" font-weight="800" letter-spacing="1" text-anchor="middle">ABC</text>
        </svg>`;
    }

    // 6. Math / Statistics / Higher Math
    if (/গণিত|math|statistic|পরিসংখ্যান|stat/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_ma_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#A855F7"/>
                    <stop offset="60%" stop-color="#9333EA"/>
                    <stop offset="100%" stop-color="#6B21A8"/>
                </linearGradient>
                <linearGradient id="sh_ma_${id}" x1="0" y1="0" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_ma_${id})"/>
            <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_ma_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <path d="M10 22H34M22 10V34" stroke="#E9D5FF" stroke-width="1.3" stroke-linecap="round" stroke-opacity="0.7"/>
            <path d="M22 9L20 11M22 9L24 11M35 22L33 20M35 22L33 24" stroke="#E9D5FF" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M11 28C14 28 16 14 22 14C28 14 30 28 33 28" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>
            <circle cx="17" cy="19" r="2.2" fill="#FDE047"/>
            <circle cx="27" cy="23" r="2.2" fill="#FDE047"/>
        </svg>`;
    }

    // 7. Economics
    if (/econom|অর্থনীতি/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_ec_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#EA580C"/>
                    <stop offset="60%" stop-color="#C2410C"/>
                    <stop offset="100%" stop-color="#7C2D12"/>
                </linearGradient>
                <linearGradient id="sh_ec_${id}" x1="0" y1="0" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_ec_${id})"/>
            <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_ec_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <circle cx="22" cy="22" r="11" fill="#78350F" stroke="#FDE68A" stroke-width="1.8"/>
            <circle cx="22" cy="22" r="8.5" fill="none" stroke="#FDE68A" stroke-dasharray="1.5 1.5"/>
            <text x="22" y="26.5" fill="#FFFFFF" font-family="'Baloo Da 2', sans-serif" font-size="14" font-weight="800" text-anchor="middle">৳</text>
        </svg>`;
    }

    // 8. Management / Marketing / Law / Business
    if (/management|ব্যবস্থাপনা|marketing|মার্কেটিং|ব্যবসা|business|organi|আইন|law/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_mg_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#3B82F6"/>
                    <stop offset="60%" stop-color="#2563EB"/>
                    <stop offset="100%" stop-color="#1D4ED8"/>
                </linearGradient>
                <linearGradient id="sh_mg_${id}" x1="0" y1="0" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_mg_${id})"/>
            <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_mg_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <circle cx="22" cy="22" r="11" fill="#1E3A8A" stroke="#BFDBFE" stroke-width="1.5"/>
            <circle cx="22" cy="22" r="7.5" fill="#3B82F6" stroke="#FFFFFF" stroke-width="1.2"/>
            <circle cx="22" cy="22" r="3.5" fill="#EF4444"/>
            <path d="M29 15L23 21" stroke="#FDE047" stroke-width="2" stroke-linecap="round"/>
        </svg>`;
    }

    // 9. ICT / Computer
    if (/ict|তথ্য|computer|কম্পিউটার/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_it_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#6366F1"/>
                    <stop offset="60%" stop-color="#4F46E5"/>
                    <stop offset="100%" stop-color="#312E81"/>
                </linearGradient>
                <linearGradient id="sh_it_${id}" x1="0" y1="0" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_it_${id})"/>
            <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_it_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <rect x="9" y="11" width="26" height="18" rx="3" fill="#0F172A" stroke="#C7D2FE" stroke-width="1.2"/>
            <path d="M16 17L13 20L16 23M28 17L31 20L28 23M23 15L19 25" stroke="#38BDF8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M19 29H25M22 29V32M17 32H27" stroke="#C7D2FE" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`;
    }

    // 10. Science
    if (/পদার্থ|physics|রসায়ন|chemistry|জীব|biology/.test(n)) {
        return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="bg_sc_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#EC4899"/>
                    <stop offset="60%" stop-color="#DB2777"/>
                    <stop offset="100%" stop-color="#831843"/>
                </linearGradient>
                <linearGradient id="sh_sc_${id}" x1="0" y1="0" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_sc_${id})"/>
            <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_sc_${id})"/>
            <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
            <path d="M20 12H24V17L28 27C28.7 28.5 27.6 30 26 30H18C16.4 30 15.3 28.5 16 27L20 17V12Z" fill="#FCE7F3" stroke="#FBCFE8" stroke-width="1.2"/>
            <path d="M17 25C19 24 21 27 24 25C26 24 27 25 27 25" stroke="#F43F5E" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="20" cy="22" r="1.2" fill="#F43F5E"/>
            <circle cx="23" cy="20" r="1" fill="#F43F5E"/>
        </svg>`;
    }

    // Default Fallback: Elegant 3D Book & Knowledge
    const fallbackGradients = [
        ['#6366F1', '#4F46E5', '#3730A3'],
        ['#14B8A6', '#0D9488', '#0F766E'],
        ['#F97316', '#EA580C', '#C2410C'],
        ['#8B5CF6', '#7C3AED', '#5B21B6']
    ];
    const pal = fallbackGradients[uid % fallbackGradients.length];

    return `<svg class="syllabus-3d-icon" viewBox="0 0 44 44" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
            <linearGradient id="bg_df_${id}" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="${pal[0]}"/>
                <stop offset="60%" stop-color="${pal[1]}"/>
                <stop offset="100%" stop-color="${pal[2]}"/>
            </linearGradient>
            <linearGradient id="sh_df_${id}" x1="0" y1="0" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#bg_df_${id})"/>
        <rect x="2" y="2" width="40" height="19" rx="10" fill="url(#sh_df_${id})"/>
        <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1"/>
        <path d="M22 15C18 12.5 13 13 11 14V28C13 27 18 26.5 22 29C26 26.5 31 27 33 28V14C31 13 26 12.5 22 15Z" fill="#FFFFFF" fill-opacity="0.95"/>
        <path d="M22 15V29" stroke="${pal[2]}" stroke-width="1.6"/>
        <path d="M14 18H19M14 22H19M25 18H30M25 22H30" stroke="${pal[2]}" stroke-width="1" stroke-linecap="round"/>
    </svg>`;
}

function toggleSyllabusItem(btn) {
    if (!btn) return;
    const item = btn.closest('.syllabus-item');
    if (!item) return;
    const isOpen = item.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}
window.toggleSyllabusItem = toggleSyllabusItem;

const formatPrice = v => {
    const x = clean(v);
    if (!x || x === '-') return '';
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
    if (!raw) return '<p class="desc-para">এই কোর্সের বিস্তারিত তথ্য শীঘ্রই আপডেট করা হবে।</p>';
    const lines = raw.split(/\r?\n/);
    let html = '';
    lines.forEach(rawLine => {
        const line = clean(rawLine);
        if (!line) {
            html += '<div class="desc-gap"></div>';
            return;
        }
        const isBullet = /^(?:[•▪♦◆▶\u25C6\u25C7\u25BA\u25B6🔹⭐🎯⚡🎁💡]|[\-\*]\s+)/.test(line);
        if (isBullet) {
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
        if (!raw) return new Set();
        const user = JSON.parse(raw);
        const courses = Array.isArray(user?.courses) ? user.courses : [];
        const s = new Set();
        courses.forEach(c => {
            const n = normalizeTextForMatch(c?.name);
            if (n) s.add(n);
        });
        return s;
    } catch (e) {
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
const VA_CACHE_KEYS = ['va_courses', 'va_teachers_list', 'va_gallery_data', 'va_free_videos', 'va_sw_courses', 'va_products'];

function vaGetCache(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { data, expires } = JSON.parse(raw);
        if (Date.now() > expires) { localStorage.removeItem(key); return null; }
        return data;
    } catch (e) { return null; }
}
function vaSetCache(key, value, ttl = VA_CACHE_TTL) {
    try {
        localStorage.setItem(key, JSON.stringify({ data: value, expires: Date.now() + ttl }));
    } catch (e) { }
}
function vaClearAllCache() {
    VA_CACHE_KEYS.forEach(k => {
        try { localStorage.removeItem(k); } catch (e) { }
    });
}

let vaToastTimer = null;
function vaShowToast(message) {
    let toast = document.getElementById('vaToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'vaToast';
        toast.className = 'va-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(vaToastTimer);
    vaToastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
window.vaShowToast = vaShowToast;

// Sync cache version with server
let cacheCheckPromise = null;
function ensureCacheValid() {
    if (!cacheCheckPromise) {
        cacheCheckPromise = (async function () {
            try {
                const res = await fetch(VISION_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'get_cache_version' })
                });
                if (!res.ok) return;
                const j = await res.json();
                if (j.status !== 'ok') return;
                const serverV = String(j.v ?? '0');
                const localV = localStorage.getItem('va_cv');
                if (localV === null || serverV !== localV) {
                    vaClearAllCache();
                    localStorage.setItem('va_cv', serverV);
                }
            } catch (e) { }
        })();
    }
    return cacheCheckPromise;
}

async function getAllSubjectWiseRows() {
    await ensureCacheValid();
    const cached = vaGetCache('va_sw_courses');
    if (cached && cached.length) return cached;

    const response = await fetch(VISION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'get_subjectwise_courses' })
    });
    if (!response.ok) throw Error(`Subjectwise Course Name: HTTP ${response.status}`);
    const json = await response.json();
    if (json.status === 'error') throw Error(json.message || 'Subjectwise Course Name API error');
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
    if (cached && cached.length) return cached;

    const response = await fetch(VISION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'get_teachers' })
    });
    if (!response.ok) throw Error(`Teachers: HTTP ${response.status}`);
    const json = await response.json();
    if (json.status === 'error') throw Error(json.message || 'Teachers API error');
    const data = (json.data || []).map(row => {
        const name = clean(row.name);
        if (!name) return null;
        return { name, photo: normalizeImageUrl(row.photo), subject: clean(row.subject), designation: clean(row.designation) };
    }).filter(Boolean);
    vaSetCache('va_teachers_list', data);
    return data;
}

async function getAllCourses() {
    await ensureCacheValid();
    const cached = vaGetCache('va_courses');
    if (cached && cached.length) return cached;

    const response = await fetch(VISION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'get_courses' })
    });
    if (!response.ok) throw Error(`Course Name: HTTP ${response.status}`);
    const json = await response.json();
    if (json.status === 'error') throw Error(json.message || 'Course Name API error');
    const used = new Set();
    const data = (json.data || []).map(row => {
        const level = clean(row.level), name = clean(row.name);
        if (!level || !name) return null;
        const topThisRaw = String(row.topThisRaw ?? row.topThis ?? row.top_this ?? '').trim().toLowerCase();
        const topThis = ['yes', 'true', '1'].includes(topThisRaw) || row.topThis === true;
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
    } catch (e) {
        console.error('Schema update error:', e);
    }
}

function renderCourse(course, teachers) {
    const loadingState = document.getElementById('loadingState');
    const content = document.getElementById('courseContent');
    loadingState.style.display = 'none';
    if (!course) {
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

    // Render syllabus (কোর্সের সিলেবাস)
    const subjects = parseSubjectList(course.subjectList);
    const syllabusHtml = subjects.length ? `
                <div class="detail-syllabus-wrap">
                    <div class="detail-syllabus-header">
                        <span class="detail-syllabus-title">কোর্সের সিলেবাস</span>
                        <span class="syllabus-count-pill">${toBn(subjects.length)}টি বিষয়</span>
                    </div>
                    <div class="syllabus-list">
                        ${subjects.map((subj, idx) => `
                            <div class="syllabus-item">
                                <button type="button" class="syllabus-item-btn" aria-expanded="false" onclick="toggleSyllabusItem(this)">
                                    <div class="syllabus-icon-wrap">
                                        ${getSubject3DIcon(subj, idx)}
                                    </div>
                                    <span class="syllabus-name">${escapeHtml(subj)}</span>
                                    <div class="syllabus-chevron" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </div>
                                </button>
                                <div class="syllabus-dropdown">
                                    <div class="syllabus-dropdown-inner">
                                        <div class="syllabus-perks">
                                            <span class="syllabus-perk-chip">
                                                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                                                অধ্যায়ভিত্তিক সম্পূর্ণ লাইভ ও রেকর্ডেড ক্লাস
                                            </span>
                                            <span class="syllabus-perk-chip">
                                                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                                                লেকচার শিট ও প্র্যাকটিস হ্যান্ডনোট
                                            </span>
                                            <span class="syllabus-perk-chip">
                                                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                                                অধ্যায়ভিত্তিক কুইজ, মডেল টেস্ট ও সমাধান
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>`).join('')}
                    </div>
                </div>` : '';

    const image = course.image || '';

    // Match course instructors
    const matchedTeachers = (course.teacherNames || []).map(n => {
        const key = normalizeTextForMatch(n);
        return teachers.find(t => normalizeTextForMatch(t.name) === key) || { name: n, photo: '', subject: '', designation: '' };
    });
    const initials = name => escapeHtml(clean(name).slice(0, 1).toUpperCase() || '?');

    let courseInstructorsHtml = '';
    if (matchedTeachers.length) {
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
    if (isUpcoming) {
        enrollButtonHtml = `
                    <button type="button" class="btn btn-primary enroll-btn" style="background:#64748b;cursor:not-allowed;" onclick="vaShowToast('Upcoming')">
                        Upcoming
                    </button>`;
    } else if (isEnrolled) {
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
                                <span class="detail-category-badge">${escapeHtml(course.category)}</span>
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

                        <!-- কোর্সের সিলেবাস -->
                        ${syllabusHtml}

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
    if (!row) {
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
        return teachers.find(t => normalizeTextForMatch(t.name) === key) || { name: n, photo: '', subject: '', designation: '' };
    });

    let swInstructorsHtml = '';
    if (matchedTeachers.length) {
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
    if (isEnrolled) {
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
    if (!slug && !swId) {
        window.location.replace('All_Courses.html');
        return;
    }
    try {
        if (swId) {
            const [rows, teachers] = await Promise.all([getAllSubjectWiseRows(), getAllTeachers().catch(() => [])]);
            const row = rows.find(r => buildSubjectWiseCourseId(r) === swId);
            renderSubjectWiseCourse(row, teachers);
            return;
        }
        const [courses, teachers] = await Promise.all([getAllCourses(), getAllTeachers().catch(() => [])]);
        const course = courses.find(c => c.slug === slug || slugify(c.name) === slugify(slug) || clean(c.name).toLowerCase() === slug.toLowerCase());
        renderCourse(course, teachers);
    } catch (error) {
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
    if (burger && nav) burger.addEventListener('click', () => nav.classList.toggle('open'));
    if (nav) nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
    loadCourseDetails();

    // Update profile button
    function updateNavProfileButton() {
        const loginBtn = document.getElementById('navLoginBtn');
        if (!loginBtn) return;
        try {
            const raw = localStorage.getItem('va_user');
            if (raw) {
                const user = JSON.parse(raw);
                const fullName = String(user?.name || '').trim();
                let displayName = 'প্রোফাইল', initial = '', hasName = false;
                if (fullName) {
                    hasName = true;
                    const titleRx = /^(md\.?|mohammad|muhammad|mst\.?|most\.?|sk\.?|sheikh|মোছাঃ|মোঃ|মুহাম্মদ|শেখ)$/i;
                    const rawParts = fullName.split(/\s+/).filter(Boolean);
                    const cleanParts = rawParts.filter(p => !titleRx.test(p));
                    const primary = cleanParts.length > 0 ? cleanParts[0] : (rawParts[0] || fullName);
                    displayName = primary.length > 10 ? primary.slice(0, 9) + '…' : primary;
                    initial = primary.charAt(0).toUpperCase();
                }
                let hash = 0;
                for (let i = 0; i < fullName.length; i++) { hash = (hash << 5) - hash + fullName.charCodeAt(i); hash |= 0; }
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
        } catch (e) { }
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
        if (e.target.closest('#howToBuyBtn')) openVideoModal();
    });
    if (videoModalClose) videoModalClose.addEventListener('click', closeVideoModal);
    if (videoModalOverlay) videoModalOverlay.addEventListener('click', (e) => {
        if (e.target === videoModalOverlay) closeVideoModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && videoModalOverlay && videoModalOverlay.classList.contains('open')) closeVideoModal();
    });
});



// ============================================================
// Night Mode / Day Mode (Dark/Light Theme) Toggle Controller
// ============================================================
(function () {
    const toggleBtn = document.getElementById('themeToggleBtn');
    const metaTheme = document.getElementById('metaThemeColor');
    if (!toggleBtn) return;

    function applyTheme(theme, animate) {
        const isDark = theme === 'dark';
        if (animate) {
            document.documentElement.classList.add('theme-transition');
            setTimeout(function () {
                document.documentElement.classList.remove('theme-transition');
            }, 350);
        }
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.documentElement.classList.add('dark');
            toggleBtn.setAttribute('aria-label', 'ডে মোড চালু করুন (Day Mode)');
            toggleBtn.setAttribute('title', 'ডে মোড চালু করুন (Day Mode)');
            if (metaTheme) metaTheme.setAttribute('content', '#090D16');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            document.documentElement.classList.remove('dark');
            toggleBtn.setAttribute('aria-label', 'নাইট মোড চালু করুন (Night Mode)');
            toggleBtn.setAttribute('title', 'নাইট মোড চালু করুন (Night Mode)');
            if (metaTheme) metaTheme.setAttribute('content', '#ffffff');
        }
    }

    const initialTheme = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(initialTheme, false);

    toggleBtn.addEventListener('click', function () {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        try {
            localStorage.setItem('va_theme', nextTheme);
        } catch (e) { }
        applyTheme(nextTheme, true);
    });

})();
