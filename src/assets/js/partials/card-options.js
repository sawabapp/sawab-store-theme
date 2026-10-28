/**
 * خيارات المنتج داخل البطاقة.
 *
 * يرسم خيارات المنتج (السعة، المقاس، اللون…) قوائم منسدلة داخل البطاقة نفسها
 * فوق زر «أضف للسلة»، فيختار العميل ويضيف دون الانتقال إلى صفحة المنتج.
 *
 * لماذا لا نكتفي بزر سلة؟ زر البطاقة يضيف بـ quick-add بمعرّف المنتج وحده،
 * فإن كان للمنتج خيارات ردّت سلة بخطأ ونقلت العميل لصفحة المنتج. لذا نعترض
 * النقر في مرحلة الالتقاط ونرسل الخيارات المختارة بأنفسنا عبر
 * `salla.cart.addItem(FormData)` بالحقول نفسها التي يرسلها فورم صفحة المنتج
 * (`id` · `quantity` · `options[<optionId>]`).
 *
 * لا نرسم `salla-product-options` داخل البطاقة: هو مبني لصفحة واسعة، وزر سلة
 * يبحث عنه بـ document.querySelector بمعرّف المنتج في الصفحة كلها فيتداخل مع
 * صفحة المنتج و«منتج الأسبوع». نرسم قوائمنا من بيانات الخيارات نفسها.
 *
 * متى نسأل سلة؟ لا عند ظهور البطاقة: شروط سوق الثيمات تمنع «طلبًا لكل منتج»
 * (Technical Review 1.5)، وصفحة تصنيف فيها عشرات البطاقات. بيانات القائمة
 * تقول مجانًا إن للمنتج خيارات (`has_options`)، فنرسم مكانها قائمة «اختر
 * الخيارات» مؤقتة — فلا يقفز التخطيط لاحقًا — ولا نجلب الخيارات إلا حين
 * يقترب العميل من البطاقة: مرور الماوس أو اللمس أو التركيز بلوحة المفاتيح.
 *
 * القائمة المنسدلة تعبّر عن اختيار واحد فقط، فخيارات الاختيار المتعدّد —
 * كبقية ما لا يتّسع للبطاقة (نص، ملف، تاريخ، خريطة…) — إن كانت إلزامية، أو
 * وُجدت أكثر من مجموعتي خيارات، يُترك المنتج لمسار سلة الأصلي (صفحة المنتج).
 *
 * الإعداد `card_quick_options` يصل في `window.card_options_enabled`.
 * أضف `?sawab-debug` للرابط ليطبع كل خطوة في الـconsole.
 */
import { getProductData } from './product-card-enhancer';
import t from './i18n';

// أنواع الاختيار الواحد — وحدها تُرسم قائمة منسدلة
const SINGLE_TYPES = ['single-option', 'radio', 'color', 'thumbnail'];
// أنواع لها مسارات خاصة في زر سلة (حجز، تبرّع…) فلا نلمسها
const SUPPORTED_PRODUCT_TYPES = ['product', 'service', 'digital', 'food', 'codes', undefined, ''];
const MAX_GROUPS = 2;

export default function initCardOptions() {
  if (window.card_options_enabled === false) return;

  const debug = window.location.search.includes('sawab-debug');
  const log = (...args) => debug && console.info('[sawab-card-options]', ...args);

  const choose = name => t('choose-option', { name });
  const soldOut = t('sold-out');
  const chooseOptions = t('choose-options');

  const escape = str => String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // معرّف المنتج ⇒ وعد بمجموعات الخيارات القابلة للرسم، أو null إن لم تصلح للبطاقة
  const cache = new Map();

  /**
   * يحوّل خيارات المنتج إلى مجموعات تُرسم في البطاقة، أو null إذا وُجد خيار
   * إلزامي لا تعبّر عنه قائمة منسدلة (فالإضافة بدونه ستفشل حتمًا).
   */
  function toGroups(options) {
    const groups = [];

    for (const option of options) {
      if (option.type === 'splitter' || option.name === 'splitter') continue;

      const drawable = SINGLE_TYPES.includes(option.type)
        && option.details?.length && !option.visibility_condition;

      if (!drawable) {
        if (option.required) return null;
        continue; // اختياري لا يتّسع للبطاقة ⇒ نتجاهله، وتقبل سلة الإضافة بدونه
      }

      groups.push({
        id: option.id,
        name: option.name,
        required: !!option.required,
        details: option.details,
      });
    }

    if (!groups.length || groups.length > MAX_GROUPS) return null;
    return groups;
  }

  function load(product) {
    const id = String(product.id);
    if (!cache.has(id)) {
      cache.set(id, salla.api.product.getDetails(product.id, ['options'])
        .then(res => {
          const options = res?.data?.options || [];
          log(id, 'options:', options);
          return options.length ? toGroups(options) : null;
        })
        .catch(error => {
          log(id, 'تعذّر جلب الخيارات:', error);
          cache.delete(id);
          return null;
        }));
    }
    return cache.get(id);
  }

  function render(card, product, groups) {
    const box = document.createElement('div');
    box.className = 'sawab-opts';
    box.dataset.productId = product.id;

    box.innerHTML = groups.map(group => {
      const items = group.details.map(detail => {
        const out = detail.is_out || detail.is_available === false;
        return `<option value="${escape(detail.id)}"${detail.is_selected && !out ? ' selected' : ''}${out ? ' disabled' : ''}>${
          escape(detail.name)}${out ? ` — ${soldOut}` : ''}</option>`;
      }).join('');

      return `
        <div class="sawab-opts__group" data-required="${group.required ? '1' : ''}">
          <select class="sawab-opts__select" name="options[${group.id}]" aria-label="${escape(group.name)}">
            <option value="">${escape(choose(group.name))}</option>
            ${items}
          </select>
        </div>`;
    }).join('');

    // فوق زر الإضافة مباشرة. إدراج عنصر بجانب أبناء سلة آمن (كالماركة
    // والضريبة)؛ الممنوع هو استبدال ما رسمته هي (docs/DEVELOPMENT.md)
    const footer = card.querySelector('.s-product-card-content-footer');
    if (!footer) return null;
    card.querySelector('.sawab-opts')?.remove(); // القائمة المؤقتة
    footer.parentNode.insertBefore(box, footer);
    box.querySelectorAll('select').forEach(select => select.classList.toggle('has-value', !!select.value));
    card.classList.add('sawab-has-opts');
    return box;
  }

  /** المنتج إن صلح لخيارات البطاقة، أو null */
  function eligible(card) {
    if (card.classList.contains('s-product-card-minimal')) return null;
    const product = getProductData(card);
    if (!product?.id) return null;
    if (product.has_options === false) return null;
    if (product.status && product.status !== 'sale') return null;
    if (!SUPPORTED_PRODUCT_TYPES.includes(product.type)) return null;
    return product;
  }

  /**
   * قائمة «اختر الخيارات» مؤقتة بلا طلب: تحجز مكان القوائم الحقيقية فلا يقفز
   * التخطيط حين تصل. زرّ لا select — فلا يفتح العميل قائمة فارغة.
   */
  function renderPlaceholder(card, product) {
    const footer = card.querySelector('.s-product-card-content-footer');
    if (!footer) return;
    const box = document.createElement('div');
    box.className = 'sawab-opts is-pending';
    box.dataset.productId = product.id;
    box.innerHTML = `
      <div class="sawab-opts__group">
        <button type="button" class="sawab-opts__select sawab-opts__placeholder" data-sawab-opts-open>${chooseOptions}</button>
      </div>`;
    footer.parentNode.insertBefore(box, footer);
    card.classList.add('sawab-has-opts');
  }

  function dropPlaceholder(card) {
    card.querySelector('.sawab-opts.is-pending')?.remove();
    card.classList.remove('sawab-has-opts');
  }

  // البطاقة ⇒ وعد الجلب الجاري، فينتظره من يضغط والطلب لم يعد بعد
  const inFlight = new WeakMap();

  /** يجلب الخيارات (مرة لكل منتج) ويرسمها. يُستدعى عند التفاعل فقط */
  function prepare(card) {
    if (!card) return Promise.resolve();
    if (inFlight.has(card)) return inFlight.get(card);
    const state = card.dataset.sawabOpts;
    if (state === 'none') return Promise.resolve();
    if (state === 'ready' && card.querySelector('.sawab-opts:not(.is-pending)')) return Promise.resolve();

    const product = eligible(card);
    if (!product) return Promise.resolve();

    const job = fetchAndRender(card, product).finally(() => inFlight.delete(card));
    inFlight.set(card, job);
    return job;
  }

  async function fetchAndRender(card, product) {
    card.dataset.sawabOpts = 'loading';
    card.querySelector('.sawab-opts.is-pending')?.classList.add('is-loading');
    const groups = await load(product);

    if (!card.isConnected) return;
    if (!groups) {
      dropPlaceholder(card);
      card.dataset.sawabOpts = 'none';
      return;
    }

    const box = render(card, product, groups);
    card.dataset.sawabOpts = box ? 'ready' : 'none';
  }

  function watch(card) {
    if (card.dataset.sawabOptsWatched) {
      // سلة أعادت رسم البطاقة فمحت كتلتنا ⇒ نعيدها (من الذاكرة، بلا طلب جديد)
      if (card.querySelector('.sawab-opts')) return;
      if (card.dataset.sawabOpts === 'ready') {
        delete card.dataset.sawabOpts;
        prepare(card);
      } else if (card.dataset.sawabOpts === 'pending') {
        const product = eligible(card);
        if (product) renderPlaceholder(card, product);
      }
      return;
    }

    const product = eligible(card);
    if (!product) return; // قد لا تكون البيانات وصلت ⇒ يعيد المسح المحاولة
    card.dataset.sawabOptsWatched = '1';

    // المنتج المعروف أن له خيارات يأخذ مكانها الآن، والمجهول ينتظر التفاعل
    if (product.has_options === true) {
      card.dataset.sawabOpts = 'pending';
      renderPlaceholder(card, product);
    }
  }

  // ----- الجلب عند التفاعل -----
  const warm = event => {
    const card = event.target.closest?.('.s-product-card-entry');
    if (card?.dataset.sawabOptsWatched) prepare(card);
  };
  document.addEventListener('pointerover', warm, { passive: true });
  document.addEventListener('touchstart', warm, { passive: true });
  document.addEventListener('focusin', warm);

  // ضغطة على القائمة المؤقتة ⇒ ننتظر الخيارات ونضع التركيز على أولها
  document.addEventListener('click', async event => {
    const opener = event.target.closest?.('[data-sawab-opts-open]');
    if (!opener) return;
    const card = opener.closest('.s-product-card-entry');
    await prepare(card);
    const select = card?.querySelector('.sawab-opts:not(.is-pending) select');
    if (!select) return;
    select.focus({ preventScroll: true });
    try { select.showPicker?.(); } catch (e) { /* غير مدعوم في كل المتصفحات */ }
  });

  const scan = () => document.querySelectorAll('.s-product-card-entry').forEach(watch);
  scan();
  requestAnimationFrame(scan);
  setTimeout(scan, 400);
  salla.event.on('salla-products-list::products.fetched', () => setTimeout(scan, 50));

  new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1 || node.classList?.contains('sawab-opts')) continue;
        const card = node.classList?.contains('s-product-card-entry')
          ? node
          : node.closest?.('.s-product-card-entry');
        if (card) watch(card);
        node.querySelectorAll?.('.s-product-card-entry').forEach(watch);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ----- السعر -----
  // نسأل نقطة السعر مباشرةً لا عبر salla.product.getPrice: الأخير يبثّ حدث
  // تحديث سعر عامًا تلتقطه أقسام أخرى («منتج الأسبوع») فتكتب سعر منتج آخر
  function paintPrice(card, data) {
    const money = value => salla.money(Number(value) || 0);
    const onSale = data.has_sale_price && Number(data.regular_price) > Number(data.price);

    const plain = card.querySelector('.s-product-card-price');
    const sale = card.querySelector('.s-product-card-sale-price');
    const starting = card.querySelector('.s-product-card-starting-price');

    // h4 تملؤه سلة بخاصية innerHTML لا بعقدة نصّ تحتفظ بمرجعها، فتعديله آمن
    if (plain) plain.innerHTML = money(data.price);
    if (sale) {
      const now = sale.querySelector('h4');
      const was = sale.querySelector('span');
      if (now) now.innerHTML = money(data.price);
      if (was) {
        was.innerHTML = onSale ? money(data.regular_price) : '';
        was.hidden = !onSale;
      }
    }
    if (starting) {
      const now = starting.querySelector('h4');
      if (now) now.innerHTML = money(data.price);
      // «يبدأ من» لم تعد صحيحة بعد اختيار الخيار
      card.classList.add('sawab-opts-priced');
    }
  }

  const priceTickets = new WeakMap();

  function formData(box) {
    const data = new FormData();
    data.append('id', box.dataset.productId);
    data.append('quantity', '1');
    box.querySelectorAll('select').forEach(select => select.value && data.append(select.name, select.value));
    return data;
  }

  function missingGroups(box) {
    return [...box.querySelectorAll('.sawab-opts__group[data-required="1"]')]
      .filter(group => !group.querySelector('select')?.value);
  }

  document.addEventListener('change', event => {
    const box = event.target.closest?.('.sawab-opts');
    if (!box) return;

    const group = event.target.closest('.sawab-opts__group');
    group?.classList.remove('is-missing');
    event.target.classList?.toggle('has-value', !!event.target.value);

    if (missingGroups(box).length) return;

    const card = box.closest('.s-product-card-entry');
    const ticket = (priceTickets.get(box) || 0) + 1;
    priceTickets.set(box, ticket);

    salla.api.request(`products/${box.dataset.productId}/price`, formData(box), 'post')
      .then(res => {
        if (priceTickets.get(box) !== ticket || !res?.data) return;
        log(box.dataset.productId, 'price:', res.data);
        paintPrice(card, res.data);
      })
      .catch(error => log('تعذّر جلب السعر:', error));
  });

  // ----- الإضافة للسلة -----
  // مرحلة الالتقاط: زر سلة يعالج النقر بنفسه، فنسبقه قبل أن يصل إليه
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('salla-add-product-button');
    const card = button?.closest('.s-product-card-entry');
    if (!card) return;

    // الخيارات لم تصل بعد ⇒ ننتظرها بدل أن تنقل سلة العميل لصفحة المنتج
    const state = card.dataset.sawabOpts;
    if (state === 'pending' || state === 'loading') {
      event.preventDefault();
      event.stopPropagation();
      await prepare(card);
      if (!card.querySelector('.sawab-opts:not(.is-pending)')) {
        // تبيّن أن الخيارات لا تتّسع للبطاقة ⇒ مسار سلة الأصلي
        card.dataset.sawabOpts = 'none';
        (button.querySelector('button') || button).click();
      }
      return;
    }

    const box = card.querySelector('.sawab-opts:not(.is-pending)');
    if (!box) return;

    event.preventDefault();
    event.stopPropagation();

    const missing = missingGroups(box);
    if (missing.length) {
      missing.forEach(group => {
        group.classList.remove('is-missing');
        void group.offsetWidth; // نعيد تشغيل الاهتزاز عند كل محاولة
        group.classList.add('is-missing');
      });
      missing[0].querySelector('select')?.focus({ preventScroll: true });
      return;
    }

    const inner = button.querySelector('salla-button');
    inner?.load?.();
    try {
      await salla.cart.addItem(formData(box));
    } catch (error) {
      log('تعذّرت الإضافة:', error);
    } finally {
      inner?.stop?.();
    }
  }, true);
}
