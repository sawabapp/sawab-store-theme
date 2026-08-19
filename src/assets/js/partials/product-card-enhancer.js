/**
 * يضيف اسم الماركة وملاحظة "شامل الضريبة" إلى بطاقات المنتجات.
 *
 * معظم قوائم المتجر (الرئيسية، التصنيفات، البحث، المفضلة) تُرسَم بمكوّن
 * <salla-products-list> من مكتبة سلة، وهو يبني بطاقاته داخليًا ولا يوفّر
 * إلا slot واحدًا لنص زر الإضافة — فلا سبيل لحقن الماركة أو الضريبة عبر
 * القالب. لذا نُحسّن البطاقات بعد رسمها.
 *
 * البطاقات تُرسَم على دفعات (تحميل أولي، ترقيم صفحات، فلاتر، سلايدرات)،
 * لذا نراقب الـDOM بدل الاكتفاء بمرور واحد، ونعلّم كل بطاقة عند معالجتها
 * حتى لا تُضاف العناصر مرتين عند إعادة الرسم.
 */
const TAX_LABEL = 'شامل الضريبة';

function escapeHTML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * المنفذ الوحيد لبيانات المنتج هو الخاصية العامة `product` على عنصر البطاقة.
 * أما `productData` فهي حالة داخلية (@State) في مكوّن سلة ولا تُعرَض على
 * عنصر DOM مطلقًا. وحين تمرّر القائمةُ المنتجَ ككائن تضبطه كخاصية لا كسمة،
 * فلا يُجدي قراءة getAttribute وحده — لذا نجرّب المصادر الثلاثة بالترتيب.
 */
function getProductData(card) {
  const host = card.closest('salla-product-card, custom-salla-product-card') || card;

  const raw = host.product || host.productData || (host.getAttribute && host.getAttribute('product'));
  if (!raw) return null;
  if (typeof raw === 'object') return raw;

  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/** الماركة قد تأتي ككائن {name} أو كنص مباشر حسب مصدر البيانات */
function getBrandName(product) {
  const brand = product?.brand;
  if (!brand) return '';
  return typeof brand === 'string' ? brand : brand.name || '';
}

function addBrand(card, product) {
  const brand = getBrandName(product);
  if (!brand) return;
  if (card.querySelector('.sawab-card__brand')) return;

  const title = card.querySelector('.s-product-card-content-title');
  if (!title) return;

  const el = document.createElement('div');
  el.className = 'sawab-card__brand';
  el.innerHTML = escapeHTML(brand);
  title.parentNode.insertBefore(el, title);
}

function addTaxNote(card) {
  // تُخفى الملاحظة فقط إذا صرّح المتجر أن أسعاره لا تشمل الضريبة، حتى لا
  // ندّعي ما ليس صحيحًا. أما إذا كان الإعداد غير مضبوط أصلًا (كما في المتاجر
  // التجريبية) فتُعرض، لأن الأسعار في متاجر السعودية شاملة للضريبة افتراضًا.
  if (window.taxable_prices_enabled === false || window.taxable_prices_enabled === 'false') return;
  if (card.querySelector('.sawab-card__tax')) return;

  // السعر قد يكون سعرًا عاديًا أو مخفّضًا أو "يبدأ من"
  const price = card.querySelector(
    '.s-product-card-price, .s-product-card-sale-price, .s-product-card-starting-price'
  );
  if (!price) return;

  const el = document.createElement('span');
  el.className = 'sawab-card__tax';
  el.textContent = TAX_LABEL;
  price.parentNode.insertBefore(el, price.nextSibling);
}

/**
 * سلة لا ترسم نسبة الخصم على البطاقة، وشارة `promotion_title` نصّ يكتبه التاجر
 * ("وفّر!"). نحسب النسبة من الأسعار — أو من discount_percentage إن جاء بكسوره
 * الطويلة — ونضعها شارة بيج بجانب السعر كما في صفحة المنتج.
 */
function getDiscountPercent(product) {
  const declared = parseFloat(String(product?.discount_percentage || '').replace(/[^\d.]/g, ''));
  if (Number.isFinite(declared) && declared > 0) return Math.round(declared);

  const regular = Number(product?.regular_price);
  const sale = Number(product?.sale_price ?? product?.price);
  if (!Number.isFinite(regular) || !Number.isFinite(sale) || regular <= 0 || sale >= regular) return 0;

  return Math.round((1 - sale / regular) * 100);
}

function addDiscount(card, product) {
  if (card.querySelector('.sawab-card__save')) return;

  const percent = getDiscountPercent(product);
  if (!percent) return;

  // صف السعر المخفّض يحوي السعر الحالي والسعر القديم مشطوبًا، فالشارة تليهما
  const row = card.querySelector('.s-product-card-sale-price');
  if (!row) return;

  const el = document.createElement('span');
  el.className = 'sawab-card__save';
  el.textContent = `وفّر ${percent}%`;
  row.appendChild(el);
}

function enhance(card) {
  if (!card) return;

  // البطاقة المصغّرة لا تتّسع للماركة والضريبة
  if (card.classList.contains('s-product-card-minimal')) return;

  // تُتَتبَّع الإضافتان استقلالًا: الضريبة نص ثابت ينجح من أول مرور، أما
  // الماركة فتحتاج بيانات المنتج التي قد لا تكون جاهزة بعد. لو استُخدمت
  // علامة واحدة، لأغلق نجاحُ الضريبةِ البابَ على إعادة محاولة الماركة.
  if (!card.dataset.sawabTax) {
    addTaxNote(card);
    if (card.querySelector('.sawab-card__tax')) card.dataset.sawabTax = '1';
  }

  // الماركة ونسبة الخصم تحتاجان بيانات المنتج، فتُعلَّم البطاقة معًا حين تصل
  if (!card.dataset.sawabBrand) {
    const product = getProductData(card);
    // ما دامت البيانات لم تصل، نترك البطاقة دون علامة لتُعاد المحاولة.
    // وحين تصل نعلّمها سواء وُجدت ماركة أم لا، فلا تتكرر المحاولة بلا طائل.
    if (product) {
      addBrand(card, product);
      addDiscount(card, product);
      card.dataset.sawabBrand = '1';
    }
  }
}

function enhanceAll(root = document) {
  root.querySelectorAll('.s-product-card-entry').forEach(enhance);
}

/**
 * مكوّنات سلة تُرطَّب (hydrate) بعد إدراجها في الصفحة، فبيانات المنتج قد لا
 * تكون متاحة في اللحظة الأولى. لذا نمرّ ثلاث مرات: فورًا، وبعد أول إطار،
 * ثم بعد مهلة قصيرة تكفي لاكتمال الترطيب.
 */
function scheduleEnhance(root) {
  enhanceAll(root);
  requestAnimationFrame(() => enhanceAll(root));
  setTimeout(() => enhanceAll(root), 400);
}

export default function initProductCardEnhancer() {
  scheduleEnhance();

  // الحدث الذي تُطلقه قائمة المنتجات بعد جلب دفعة جديدة
  salla.event.on('salla-products-list::products.fetched', () => scheduleEnhance());

  // شبكة أمان لأي بطاقة تُرسَم بطريقة أخرى (سلايدرات، مفضلة، فلاتر)
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;

        if (node.classList?.contains('s-product-card-entry')) {
          enhance(node);
          continue;
        }

        // عند ترطيب المكوّن تُضاف عناصره الداخلية، والبطاقة هي العنصر الأب
        // لا المُضاف — فنصعد إليها، وإلا فاتنا حقن الماركة بعد وصول البيانات.
        const host = node.closest?.('.s-product-card-entry');
        if (host) enhance(host);
        else if (node.querySelector) enhanceAll(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
