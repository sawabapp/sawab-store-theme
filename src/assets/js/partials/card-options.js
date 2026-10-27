/**
 * خيارات المنتج داخل البطاقة.
 *
 * يرسم خيارات المنتج (السعة، المقاس، اللون…) أزرارًا صغيرة داخل البطاقة نفسها
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
 * صفحة المنتج و«منتج الأسبوع». نرسم أزرارنا من بيانات الخيارات نفسها.
 *
 * ما لا يتّسع للبطاقة (نص، ملف، تاريخ، خريطة…) إن كان إلزاميًا، أو أكثر من
 * مجموعتي خيارات، يُترك لمسار سلة الأصلي — أي صفحة المنتج كما هو اليوم.
 *
 * الإعداد `card_quick_options` يصل في `window.card_options_enabled`.
 * أضف `?sawab-debug` للرابط ليطبع كل خطوة في الـconsole.
 */
import { getProductData } from './product-card-enhancer';

// أنواع اختيار واحد / متعدّد تُرسم أزرارًا
const SINGLE_TYPES = ['single-option', 'radio', 'color', 'thumbnail'];
const MULTIPLE_TYPES = ['multiple-options', 'checkbox'];
// أنواع لها مسارات خاصة في زر سلة (حجز، تبرّع…) فلا نلمسها
const SUPPORTED_PRODUCT_TYPES = ['product', 'service', 'digital', 'food', 'codes', undefined, ''];
const MAX_GROUPS = 2;

export default function initCardOptions() {
  if (window.card_options_enabled === false) return;

  const debug = window.location.search.includes('sawab-debug');
  const log = (...args) => debug && console.info('[sawab-card-options]', ...args);

  const isArabic = (document.documentElement.getAttribute('lang') || 'ar').startsWith('ar');
  const choose = name => (isArabic ? `اختر ${name}` : `Choose ${name}`);

  const escape = str => String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // معرّف المنتج ⇒ وعد بمجموعات الخيارات القابلة للرسم، أو null إن لم تصلح للبطاقة
  const cache = new Map();
  let uid = 0;

  /**
   * يحوّل خيارات المنتج إلى مجموعات تُرسم في البطاقة، أو null إذا وُجد خيار
   * إلزامي لا يُرسم أزرارًا (فالإضافة بدونه ستفشل حتمًا).
   */
  function toGroups(options) {
    const groups = [];

    for (const option of options) {
      if (option.type === 'splitter' || option.name === 'splitter') continue;

      const isSingle = SINGLE_TYPES.includes(option.type);
      const isMultiple = MULTIPLE_TYPES.includes(option.type);
      const drawable = (isSingle || isMultiple) && option.details?.length && !option.visibility_condition;

      if (!drawable) {
        if (option.required) return null;
        continue; // اختياري لا يتّسع للبطاقة ⇒ نتجاهله، وتقبل سلة الإضافة بدونه
      }

      groups.push({
        id: option.id,
        name: option.name,
        multiple: isMultiple,
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
      const name = `options[${group.id}]${group.multiple ? '[]' : ''}`;
      const inputType = group.multiple ? 'checkbox' : 'radio';
      const groupKey = `sawab-opt-${++uid}`;

      const chips = group.details.map(detail => {
        const out = detail.is_out || detail.is_available === false;
        const swatch = detail.color
          ? `<i class="sawab-opts__swatch" style="background:${escape(detail.color)}" aria-hidden="true"></i>`
          : '';
        return `
          <label class="sawab-opts__chip${out ? ' is-out' : ''}">
            <input type="${inputType}" name="${name}" value="${escape(detail.id)}"
                   data-group="${groupKey}"${detail.is_selected ? ' checked' : ''}${out ? ' disabled' : ''}>
            <span>${swatch}${escape(detail.name)}</span>
          </label>`;
      }).join('');

      return `
        <div class="sawab-opts__group" data-group="${groupKey}"
             data-required="${group.required ? '1' : ''}" data-hint="${escape(choose(group.name))}">
          <span class="sawab-opts__label">${escape(group.name)}</span>
          <div class="sawab-opts__chips" role="${group.multiple ? 'group' : 'radiogroup'}"
               aria-label="${escape(group.name)}">${chips}</div>
        </div>`;
    }).join('');

    // فوق زر الإضافة مباشرة. إدراج عنصر بجانب أبناء سلة آمن (كالماركة
    // والضريبة)؛ الممنوع هو استبدال ما رسمته هي (CLAUDE.md)
    const footer = card.querySelector('.s-product-card-content-footer');
    if (!footer) return null;
    footer.parentNode.insertBefore(box, footer);
    card.classList.add('sawab-has-opts');
    return box;
  }

  async function prepare(card) {
    if (card.classList.contains('s-product-card-minimal')) return;
    if (card.querySelector('.sawab-opts')) return;

    const product = getProductData(card);
    if (!product?.id) return; // لم يكتمل الترطيب ⇒ يعيد المراقب المحاولة
    if (product.has_options === false) return;
    if (product.status && product.status !== 'sale') return;
    if (!SUPPORTED_PRODUCT_TYPES.includes(product.type)) return;

    card.dataset.sawabOpts = 'loading';
    const groups = await load(product);

    if (!groups) {
      card.dataset.sawabOpts = 'none';
      return;
    }
    // قد تعيد سلة رسم البطاقة أثناء الانتظار
    if (!card.isConnected || card.querySelector('.sawab-opts')) return;

    const box = render(card, product, groups);
    card.dataset.sawabOpts = box ? 'ready' : 'none';
  }

  // ----- الجلب عند الاقتراب من الشاشة -----
  // صفحة تصنيف فيها عشرات البطاقات؛ لا نسأل سلة إلا عمّا يوشك العميل أن يراه
  const seen = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      seen.unobserve(entry.target);
      prepare(entry.target);
    });
  }, { rootMargin: '300px 0px' });

  function watch(card) {
    if (card.dataset.sawabOptsWatched) {
      // البطاقة مُراقَبة مسبقًا لكن سلة أعادت رسمها فمحت كتلتنا
      if (card.dataset.sawabOpts === 'ready' && !card.querySelector('.sawab-opts')) {
        delete card.dataset.sawabOpts;
        prepare(card);
      }
      return;
    }
    card.dataset.sawabOptsWatched = '1';
    seen.observe(card);
  }

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
    box.querySelectorAll('input:checked').forEach(input => data.append(input.name, input.value));
    return data;
  }

  function missingGroups(box) {
    return [...box.querySelectorAll('.sawab-opts__group[data-required="1"]')]
      .filter(group => !group.querySelector('input:checked'));
  }

  document.addEventListener('change', event => {
    const box = event.target.closest?.('.sawab-opts');
    if (!box) return;

    const group = event.target.closest('.sawab-opts__group');
    group?.classList.remove('is-missing');

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

    // البيانات ما زالت تُجلب ⇒ ننتظرها بدل أن تنقل سلة العميل لصفحة المنتج
    if (card.dataset.sawabOpts === 'loading') {
      event.preventDefault();
      event.stopPropagation();
      const product = getProductData(card);
      await load(product);
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!card.querySelector('.sawab-opts')) {
        // تبيّن أن الخيارات لا تتّسع للبطاقة ⇒ مسار سلة الأصلي
        card.dataset.sawabOpts = 'none';
        (button.querySelector('button') || button).click();
      }
      return;
    }

    const box = card.querySelector('.sawab-opts');
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
      missing[0].querySelector('input:not(:disabled)')?.focus({ preventScroll: true });
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
