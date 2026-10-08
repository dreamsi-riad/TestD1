const bn='০১২৩৪৫৬৭৮৯',en='0123456789';
        const toBn=v=>String(v??'').replace(/[0-9]/g,d=>bn[en.indexOf(d)]);

        // Mobile nav toggle
        const burger = document.getElementById('burgerBtn');
        const navLinks = document.getElementById('navLinks');
        if (burger && navLinks) {
            burger.addEventListener('click', () => navLinks.classList.toggle('open'));
            navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
        }

        // Update profile button
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

        // Shop API endpoint
        const SHOP_FORM_ENDPOINT = "https://late-forest-4748.dreamsicreation.workers.dev";

        function callShopApi(payload){
            const controller = new AbortController();
            const timeout = setTimeout(()=>controller.abort(), 20000);
            return fetch(SHOP_FORM_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                signal: controller.signal
            })
                .then(res=>{
                    if(!res.ok) throw new Error('No data Found');
                    return res.json();
                })
                .catch(err=>{
                    if(err.name === 'AbortError') throw new Error('Try Again Later 403');
                    throw err;
                })
                .finally(()=>clearTimeout(timeout));
        }

        let SHOP_PRODUCTS = [];

        function escapeHtml(str){
            const div = document.createElement('div');
            div.textContent = String(str == null ? '' : str);
            return div.innerHTML;
        }

        function renderProducts(products){
            const grid = document.getElementById('shopGrid');
            const badge = document.getElementById('productCountBadge');

            if(badge){
                badge.textContent = `মোট ${toBn(products.length)}টি আইটেম`;
            }

            if(!products.length){
                grid.innerHTML = `
                  <div class="shop-status-msg">
                    <svg style="width:48px;height:48px;color:#94A3B8;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
                    </svg>
                    <p style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:4px;">এই মুহূর্তে কোনো প্রোডাক্ট পাওয়া যায়নি</p>
                    <p style="font-size:14px;color:var(--ink-muted);">শীঘ্রই নতুন প্রোডাক্ট যুক্ত করা হবে।</p>
                  </div>`;
                return;
            }

            grid.innerHTML = products.map(function(p, idx){
                const outOfStock = Number(p.stock) <= 0;
                const imageHtml = p.imageUrl
                    ? '<img class="product-image" src="' + escapeHtml(p.imageUrl) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">'
                    : '<div class="product-image-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/></svg><span>' + escapeHtml(p.name) + '</span></div>';

                const stockBadgeHtml = outOfStock
                    ? '<span class="stock-badge out-stock">স্টক শেষ</span>'
                    : '<span class="stock-badge in-stock">ইন-স্টক ✓</span>';

                return '' +
                    '<article class="product-card">' +
                        '<div class="product-media-wrap">' +
                            stockBadgeHtml +
                            imageHtml +
                        '</div>' +
                        '<div class="product-body">' +
                            '<h3 class="product-title">' + escapeHtml(p.name) + '</h3>' +
                            '<div class="product-price-row">' +
                                (p.oldPrice ? '<span class="price-old">৳' + toBn(escapeHtml(p.oldPrice)) + '</span>' : '') +
                                '<span class="price-new">৳' + toBn(escapeHtml(p.newPrice)) + '</span>' +
                            '</div>' +
                            (outOfStock
                                ? '<button class="order-btn" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>স্টক শেষ</button>'
                                : '<button class="order-btn" data-index="' + idx + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>অর্ডার করুন</button>'
                            ) +
                        '</div>' +
                    '</article>';
            }).join('');
        }

        function loadProducts(){
            callShopApi({ action: 'get_products' })
                .then(function(result){
                    if(result.status === 'ok' && Array.isArray(result.data)){
                        SHOP_PRODUCTS = result.data;
                        renderProducts(SHOP_PRODUCTS);
                    } else {
                        document.getElementById('shopGrid').innerHTML =
                            '<div class="shop-status-msg">❌ প্রোডাক্ট লোড করা যায়নি। পরে আবার চেষ্টা করুন।</div>';
                    }
                })
                .catch(function(){
                    document.getElementById('shopGrid').innerHTML =
                        '<div class="shop-status-msg">Try Again Later 404</div>';
                });
        }

        loadProducts();

        // Order modal
        (function(){
            const modal = document.getElementById('orderModal');
            const closeBtn = document.getElementById('modalCloseBtn');
            const nameEl = document.getElementById('modalProductName');
            const priceEl = document.getElementById('modalProductPrice');
            const sizeRow = document.getElementById('sizeRow');
            const form = document.getElementById('orderForm');
            const submitBtn = document.getElementById('orderSubmitBtn');
            const status = document.getElementById('orderStatus');

            function openModal(product){
                nameEl.textContent = product.name;
                priceEl.textContent = '৳' + toBn(product.newPrice);
                sizeRow.style.display = product.hasSize ? '' : 'none';
                document.getElementById('orderSize').required = !!product.hasSize;
                form.dataset.productId = product.productId;
                form.dataset.productName = product.name;
                form.dataset.productPrice = product.newPrice;
                status.className = 'form-status';
                status.textContent = '';
                modal.classList.add('open');
                document.body.style.overflow = 'hidden';
            }

            function closeModal(){
                modal.classList.remove('open');
                document.body.style.overflow = '';
                form.reset();
            }

            document.getElementById('shopGrid').addEventListener('click', function(e){
                const btn = e.target.closest('.order-btn');
                if(!btn || btn.disabled) return;
                const idx = Number(btn.dataset.index);
                const product = SHOP_PRODUCTS[idx];
                if(!product) return;
                openModal(product);
            });

            closeBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(); });
            document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

            // Submit order
            form.addEventListener('submit', function(e){
                e.preventDefault();

                const phone = document.getElementById('orderPhone').value.trim();
                if(!/^01[0-9]{9}$/.test(phone)){
                    status.textContent = '❌ সঠিক মোবাইল নম্বর দিন (যেমন: 01XXXXXXXXX)।';
                    status.className = 'form-status show err';
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2.5px;margin:0 auto;display:inline-block;vertical-align:middle;"></span> প্রসেস হচ্ছে...';
                status.className = 'form-status';

                const orderData = {
                    action: 'place_order',
                    productId: form.dataset.productId,
                    productName: form.dataset.productName,
                    price: form.dataset.productPrice,
                    customerName: document.getElementById('orderName').value.trim(),
                    mobile: phone,
                    address: document.getElementById('orderAddress').value.trim(),
                    size: sizeRow.style.display !== 'none' ? document.getElementById('orderSize').value : '',
                    quantity: document.getElementById('orderQty').value
                };

                callShopApi(orderData)
                    .then(function(result){
                        if(result.status === 'ok'){
                            status.innerHTML = '✅ ' + (result.message || 'অর্ডার সফলভাবে গ্রহণ করা হয়েছে। শীঘ্রই আপনার নম্বরে কনফার্মেশনের জন্য যোগাযোগ করা হবে।');
                            status.className = 'form-status show ok';
                            form.reset();
                            loadProducts();
                        } else {
                            throw new Error(result.message || 'অর্ডার প্রক্রিয়া সম্পন্ন হতে ব্যর্থ হয়েছে।');
                        }
                    })
                    .catch(function(err){
                        status.textContent = '❌ ' + (err.message || 'একটি সমস্যা হয়েছে, আবার চেষ্টা করুন।');
                        status.className = 'form-status show err';
                    })
                    .finally(function(){
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>অর্ডার কনফার্ম করুন';
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
