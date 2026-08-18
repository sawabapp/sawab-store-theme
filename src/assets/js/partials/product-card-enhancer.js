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
 * بيانات المنتج متاحة على عنصر <salla-product-card> نفسه: خاصية productData
 * بعد ترطيب المكوّن (hydration)، وقبلها السمة product كنص JSON.
 */
function getProductData(card) {
  const host = card.closest('salla-product-card, custom-salla-product-card') || card;

  if (host.productData) return host.productData;

  const raw = host.getAttribute && host.getAttribute('product');
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function addBrand(card, product) {
  const brand = product?.brand?.name;
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

  if (!card.dataset.sawabBrand) {
    const product = getProductData(card);
    // ما دامت البيانات لم تصل، نترك البطاقة دون علامة لتُعاد المحاولة.
    // وحين تصل نعلّمها سواء وُجدت ماركة أم لا، فلا تتكرر المحاولة بلا طائل.
    if (product) {
      addBrand(card, product);
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
