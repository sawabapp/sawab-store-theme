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
        couponOk: 'طُبّق الكوبون', couponBad: 'كود غير صالح', couponOff: 'إزالة',
        shipping: 'الشحن', freeShip: 'مجاني', edit: 'تعديل الخيارات' }
    : { empty: 'Your cart is empty', browse: 'Browse products', sub: 'Subtotal',
        tax: 'VAT', total: 'Total', remove: 'Remove',
        free: 'Free shipping', left: n => `${n} away from free shipping`,
        got: 'You got free shipping 🎉', discount: 'Discount',
        couponOk: 'Coupon applied', couponBad: 'Invalid code', couponOff: 'Remove',
        shipping: 'Shipping', freeShip: 'Free', edit: 'Edit options' };

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
    // إشعار «تمت الإضافة» قد يكون ظاهرًا، ولوحتان فوق بعضهما ضوضاء
    document.querySelector('salla-add-product-toast')?.close?.();
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

  /**
   * اسم الخيار المعروض يسكن في `details[].name` للخيار المختار — أما
   * `option.value` فمعرّف رقمي. نفس منطق add-product-toast.js.
   */
  function optionLines(options) {
    if (!options?.length) return [];

    return options.reduce((lines, option) => {
      if (option.type === 'splitter') return lines;

      if (option.details?.length) {
        const chosen = option.type === 'multiple-options'
          ? option.details.filter(detail => detail.is_selected)
          : [option.details.find(detail => detail.is_selected)].filter(Boolean);

        if (chosen.length) {
          lines.push(`${escape(option.name)}: ${escape(chosen.map(d => d.name).join('، '))}`);
        }
      } else if (option.value && !['image', 'file', 'map'].includes(option.type)) {
        lines.push(`${escape(option.name)}: ${escape(option.value)}`);
      }

      return lines;
    }, []);
  }

  /**
   * فورم تعديل خيارات عنصر السلة.
   *
   * نكرّر ما تفعله صفحة السلة حرفيًا: فورم بمعرّف `item-<id>` يستدعي
   * `salla.form.onChange('cart.updateItem', …)` عند أي تغيير، وبداخله حقول
   * `options[<optionId>]`. فالتحديث يمرّ من مسار سلة نفسه لا من نداء نخترعه.
   *
   * الخيارات متعدّدة الاختيار لا تُمثَّل بقائمة منسدلة، فنتركها لصفحة السلة.
   */
  function editForm(item) {
    const editable = (item.options || []).filter(option =>
      option.details?.length && option.type !== 'multiple-options' && option.type !== 'splitter');

    if (!editable.length) return { button: '', form: '' };

    const fields = editable.map(option => `
      <label class="sawab-cart__edit-field">
        <span>${escape(option.name)}</span>
        <select name="options[${option.id}]">
          ${option.details.map(detail => `
            <option value="${detail.id}"${detail.is_selected ? ' selected' : ''}${detail.is_out ? ' disabled' : ''}>
              ${escape(detail.name)}
            </option>`).join('')}
        </select>
      </label>`).join('');

    return {
      button: `<button type="button" class="sawab-cart__edit-btn" data-edit
                 aria-label="${TEXTS.edit}"><i class="sicon-pencil" aria-hidden="true"></i></button>`,
      form: `
        <form class="sawab-cart__edit" id="item-${item.id}" hidden>
          <input type="hidden" name="id" value="${item.id}">
          <input type="hidden" name="quantity" value="${item.quantity}">
          ${fields}
        </form>`,
    };
  }

  function renderItems(items) {
    body.innerHTML = items.map(item => {
      const options = optionLines(item.options).join(' · ');

      const was = item.has_discount || item.is_on_sale
        ? `<span class="sawab-cart__was">${money(item.original_price * item.quantity)}</span>`
        : '';

      const edit = editForm(item);

      return `
        <div class="sawab-cart__item" data-id="${item.id}">
          <a class="sawab-cart__thumb" href="${escape(item.url)}" tabindex="-1" aria-hidden="true">
            <img src="${escape(item.product_image)}" alt="" loading="lazy">
          </a>
          <div class="sawab-cart__info">
            <a class="sawab-cart__name" href="${escape(item.url)}">${escape(item.product_name)}</a>
            ${options ? `<span class="sawab-cart__opts">${options}${edit.button}</span>` : ''}
            ${edit.form}
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
    // أسماء الحقول تختلف بين نسخ سلة، فنجرّب البدائل ونتجاهل الغائب.
    // والأصفار تُخفى إلا المجموع الفرعي والإجمالي — سطر «الخصم: 0» ضوضاء.
    const pick = (...keys) => keys.map(key => cart[key]).find(v => v !== undefined && v !== null);

    const subtotal = pick('sub_total', 'subtotal');
    const discount = pick('discount', 'total_discount', 'discounts');
    const shipping = pick('shipping_cost', 'shipping', 'delivery_cost');
    const tax = pick('tax', 'taxes', 'total_tax');
    const total = pick('total', 'grand_total');

    const rows = [];
    if (subtotal !== undefined) rows.push([TEXTS.sub, money(subtotal)]);
    if (Number(discount) > 0) rows.push([TEXTS.discount, `- ${money(discount)}`, 'is-off']);
    if (shipping !== undefined) {
      rows.push([TEXTS.shipping, Number(shipping) > 0 ? money(shipping) : TEXTS.freeShip]);
    }
    if (Number(tax) > 0) rows.push([TEXTS.tax, money(tax)]);
    if (total !== undefined) rows.push([TEXTS.total, money(total), 'is-grand']);

    totalsBox.innerHTML = rows.map(([label, value, modifier]) => `
      <div class="sawab-cart__total-row${modifier ? ' ' + modifier : ''}">
        <dt>${label}</dt><dd>${value}</dd>
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
    // اسم الحقل يختلف بين نسخ سلة. ولا نقبل إلا نصًّا غير فارغ: الحقل قد
    // يعود كائنًا فارغًا {} وهو قيمة صادقة، فكانت الرقاقة تظهر بلا كود
    const raw = cart.coupon?.code
      ?? cart.coupon_code
      ?? (typeof cart.coupon === 'string' ? cart.coupon : '');
    const code = typeof raw === 'string' ? raw.trim() : '';

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
  // تغيير أي خيار يمرّ لسلة عبر مسارها المعتاد، ثم نعيد قراءة السلة
  body.addEventListener('change', event => {
    const form = event.target.closest('.sawab-cart__edit');
    if (!form) return;
    form.closest('.sawab-cart__item')?.classList.add('is-busy');
    try {
      salla.form.onChange('cart.updateItem', event);
    } catch (error) {
      log('تعديل الخيارات:', error);
    }
    setTimeout(load, 600);
  });

  body.addEventListener('click', async event => {
    const editToggle = event.target.closest('[data-edit]');
    if (editToggle) {
      const form = editToggle.closest('.sawab-cart__item')?.querySelector('.sawab-cart__edit');
      if (form) form.hidden = !form.hidden;
      return;
    }

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
