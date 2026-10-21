/**
 * السلة الجانبية.
 *
 * تعترض الضغط على أيقونة السلة في الهيدر فتفتح لوحة منزلقة بدل الانتقال إلى
 * صفحة السلة. المحتوى من `salla.cart.api.details()` — نفس النداء الذي
 * يستعمله `add-product-toast.js`.
 *
 * القشرة في `views/components/side-cart.twig`، ولا تُرسم إلا إذا فعّل التاجر
 * الإعداد — فغياب العنصر يعني الخروج فورًا وإبقاء السلوك الأصلي.
 *
 * أضف `?sawab-debug` للرابط ليطبع كائن السلة كاملًا في الـconsole.
 */
export default function initSideCart() {
  const root = document.querySelector('.sawab-cart');
  if (!root) return;

  const debug = window.location.search.includes('sawab-debug');
  const log = (...args) => debug && console.info('[sawab-cart]', ...args);

  const isArabic = (document.documentElement.getAttribute('lang') || 'ar').startsWith('ar');
  const TEXTS = isArabic
    ? { empty: 'سلتك فارغة', browse: 'تصفّح المنتجات', sub: 'المجموع الفرعي',
        tax: 'ضريبة القيمة المضافة', total: 'الإجمالي', remove: 'حذف',
        free: 'شحن مجاني', left: n => `ينقصك ${n} للحصول على شحن مجاني`,
        got: 'حصلت على شحن مجاني 🎉', discount: 'الخصم',
        couponOk: 'طُبّق الكوبون', couponBad: 'كود غير صالح', couponOff: 'إزالة' }
    : { empty: 'Your cart is empty', browse: 'Browse products', sub: 'Subtotal',
        tax: 'VAT', total: 'Total', remove: 'Remove',
        free: 'Free shipping', left: n => `${n} away from free shipping`,
        got: 'You got free shipping 🎉', discount: 'Discount',
        couponOk: 'Coupon applied', couponBad: 'Invalid code', couponOff: 'Remove' };

  const $ = sel => root.querySelector(sel);
  const body = $('[data-sawab-cart-body]');
  const foot = $('[data-sawab-cart-foot]');
  const totalsBox = $('[data-sawab-cart-totals]');
  const countBox = $('[data-sawab-cart-count]');
  const shipBox = $('[data-sawab-cart-ship]');
  const shipText = $('[data-sawab-cart-ship-text]');
  const shipFill = $('[data-sawab-cart-ship-fill]');

  const threshold = Number(root.dataset.freeShipping || 0);
  const escape = str => String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // سلة تعيد الأسعار أرقامًا، وsalla.money يصوغها بعملة المتجر
  const money = value => salla.money(Number(value) || 0);

  let open = false;
  let loading = false;

  function show() {
    if (open) return;
    open = true;
    root.hidden = false;
    document.body.classList.add('sawab-cart-opened');
    requestAnimationFrame(() => root.classList.add('is-open'));
    load();
  }

  function hide() {
    if (!open) return;
    open = false;
    root.classList.remove('is-open');
    document.body.classList.remove('sawab-cart-opened');
    // ننتظر انتهاء الانزلاق قبل الإخفاء، وإلا اختفت اللوحة فجأة
    setTimeout(() => { if (!open) root.hidden = true; }, 260);
  }

  function renderEmpty() {
    body.innerHTML = `
      <div class="sawab-cart__empty">
        <i class="sicon-shopping-bag" aria-hidden="true"></i>
        <p>${TEXTS.empty}</p>
        <a href="${salla.url.get('')}" class="sawab-cart__empty-link">${TEXTS.browse}</a>
      </div>`;
    foot.hidden = true;
    shipBox.hidden = true;
    countBox.textContent = '0';
  }

  function renderShipping(subtotal) {
    if (!threshold || threshold <= 0) {
      shipBox.hidden = true;
      return;
    }
    const remaining = threshold - subtotal;
    const pct = Math.max(0, Math.min(100, (subtotal / threshold) * 100));
    shipText.innerHTML = remaining > 0
      ? TEXTS.left(`<b>${money(remaining)}</b>`)
      : TEXTS.got;
    shipFill.style.width = `${pct}%`;
    shipBox.hidden = false;
  }

  function renderItems(items) {
    body.innerHTML = items.map(item => {
      const options = (item.options || [])
        .map(opt => `${escape(opt.name)}: ${escape(opt.value?.name ?? opt.value ?? '')}`)
        .filter(line => !line.endsWith(': '))
        .join(' · ');

      const was = item.has_discount || item.is_on_sale
        ? `<span class="sawab-cart__was">${money(item.original_price * item.quantity)}</span>`
        : '';

      return `
        <div class="sawab-cart__item" data-id="${item.id}">
          <a class="sawab-cart__thumb" href="${escape(item.url)}" tabindex="-1" aria-hidden="true">
            <img src="${escape(item.product_image)}" alt="" loading="lazy">
          </a>
          <div class="sawab-cart__info">
            <a class="sawab-cart__name" href="${escape(item.url)}">${escape(item.product_name)}</a>
            ${options ? `<span class="sawab-cart__opts">${options}</span>` : ''}
            <div class="sawab-cart__row">
              <div class="sawab-cart__qty">
                <button type="button" data-step="-1" aria-label="-">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-step="1" aria-label="+">+</button>
              </div>
              <span class="sawab-cart__prices">
                <span class="sawab-cart__price">${money(item.total)}</span>${was}
              </span>
            </div>
          </div>
          <button type="button" class="sawab-cart__remove" data-remove
                  aria-label="${TEXTS.remove}"><i class="sicon-trash" aria-hidden="true"></i></button>
        </div>`;
    }).join('');
  }

  function renderTotals(cart) {
    // أسماء الحقول تختلف بين نسخ سلة، فنأخذ أول موجود ونتجاهل الغائب
    const rows = [
      [TEXTS.sub, cart.sub_total ?? cart.subtotal],
      [TEXTS.discount, cart.discount ?? cart.total_discount],
      [TEXTS.tax, cart.tax ?? cart.taxes ?? cart.total_tax],
      [TEXTS.total, cart.total],
    ].filter(([, value]) => value !== undefined && value !== null);

    totalsBox.innerHTML = rows.map(([label, value], index) => `
      <div class="sawab-cart__total-row${index === rows.length - 1 ? ' is-grand' : ''}">
        <dt>${label}</dt><dd>${money(value)}</dd>
      </div>`).join('');
    foot.hidden = false;
  }

  // ----- الكوبون -----
  const couponBox = $('[data-sawab-cart-coupon]');
  const couponForm = $('[data-sawab-coupon-form]');
  const couponMsg = $('[data-sawab-coupon-msg]');
  const couponApplied = $('[data-sawab-coupon-applied]');

  function say(text, ok) {
    if (!couponMsg) return;
    couponMsg.textContent = text;
    couponMsg.classList.toggle('is-ok', !!ok);
    couponMsg.classList.toggle('is-bad', !ok);
    couponMsg.hidden = false;
  }

  function renderCoupon(cart) {
    if (!couponApplied) return;
    // اسم الحقل يختلف بين نسخ سلة، فنأخذ أول موجود
    const code = cart.coupon?.code ?? cart.coupon ?? cart.coupon_code ?? '';

    if (!code) {
      couponApplied.hidden = true;
      couponApplied.innerHTML = '';
      return;
    }

    couponApplied.innerHTML = `
      <span class="sawab-cart__coupon-code">
        <i class="sicon-discount-coupon" aria-hidden="true"></i>${escape(code)}
      </span>
      <button type="button" data-sawab-coupon-remove>${TEXTS.couponOff}</button>`;
    couponApplied.hidden = false;
    if (couponForm) couponForm.hidden = true;
    if (couponMsg) couponMsg.hidden = true;
  }

  $('[data-sawab-coupon-toggle]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    if (couponForm) {
      couponForm.hidden = expanded;
      if (!expanded) couponForm.querySelector('input')?.focus();
    }
  });

  couponForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = couponForm.querySelector('input');
    const code = (input?.value || '').trim();
    if (!code) return;

    couponBox.classList.add('is-busy');
    try {
      await salla.cart.addCoupon(code);
      say(TEXTS.couponOk, true);
      input.value = '';
      load();
    } catch (error) {
      log('كوبون:', error);
      // سلة تعيد رسالتها حين توجد، وإلا نستعمل نصّنا
      say(error?.response?.data?.error?.message || error?.message || TEXTS.couponBad, false);
    } finally {
      couponBox.classList.remove('is-busy');
    }
  });

  couponApplied?.addEventListener('click', async event => {
    if (!event.target.closest('[data-sawab-coupon-remove]')) return;
    couponBox.classList.add('is-busy');
    await salla.cart.deleteCoupon().catch(error => log('حذف كوبون:', error));
    couponBox.classList.remove('is-busy');
    load();
  });

  async function load() {
    if (loading) return;
    loading = true;
    body.classList.add('is-loading');

    try {
      const response = await salla.cart.api.details(null, ['options']);
      const cart = response?.data?.cart;
      log('cart:', cart);

      const items = cart?.items || [];
      countBox.textContent = items.length;

      if (!items.length) {
        renderEmpty();
        return;
      }

      renderItems(items);
      renderTotals(cart);
      renderCoupon(cart);
      renderShipping(Number(cart.sub_total ?? cart.subtotal ?? cart.total) || 0);
    } catch (error) {
      log('تعذّر جلب السلة:', error);
      renderEmpty();
    } finally {
      loading = false;
      body.classList.remove('is-loading');
    }
  }

  // ----- اعتراض زر السلة في الهيدر -----
  // مرحلة الالتقاط: مكوّن سلة يعالج النقر بنفسه وينتقل للصفحة، فنسبقه
  document.addEventListener('click', event => {
    const trigger = event.target.closest('salla-cart-summary, [data-sawab-cart-open]');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    show();
  }, true);

  // ----- الإغلاق -----
  root.addEventListener('click', event => {
    if (event.target.closest('[data-sawab-cart-close]')) hide();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) hide();
  });

  // ----- الكمية والحذف -----
  body.addEventListener('click', async event => {
    const item = event.target.closest('.sawab-cart__item');
    if (!item) return;
    const id = item.dataset.id;

    if (event.target.closest('[data-remove]')) {
      item.classList.add('is-busy');
      await salla.cart.deleteItem(id).catch(error => log('حذف:', error));
      load();
      return;
    }

    const step = event.target.closest('[data-step]');
    if (!step) return;

    const current = Number(item.querySelector('.sawab-cart__qty span').textContent) || 1;
    const next = current + Number(step.dataset.step);

    if (next < 1) {
      item.classList.add('is-busy');
      await salla.cart.deleteItem(id).catch(error => log('حذف:', error));
      load();
      return;
    }

    item.classList.add('is-busy');
    await salla.cart.updateItem({ id, quantity: next }).catch(error => log('تحديث:', error));
    load();
  });

  $('[data-sawab-cart-checkout]')?.addEventListener('click', () => salla.cart.submit());

  // أي تغيير على السلة من أي مكان في الصفحة ينعكس هنا
  salla.cart.event.onUpdated?.(() => { if (open) load(); });
  salla.cart.event.onItemAdded?.(() => { if (open) load(); });
}
