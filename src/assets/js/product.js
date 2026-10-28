import 'lite-youtube-embed';
import BasePage from './base-page';
import Fslightbox from 'fslightbox';
window.fslightbox = Fslightbox;
import { zoom } from './partials/image-zoom';

import t from './partials/i18n';

// نصوص ظاهرة للعميل من ملفات الترجمة (مفاتيح sawab.product.*) عبر partials/i18n.js
const TEXTS = {
  addToCart: name => t('add-name-to-cart', { name }),
  questionSent: t('question-sent'),
};

function escapeHTML(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** صف ملحق مصغّر: صورة صغيرة، اسم بسطر واحد، السعر، وزر إضافة دائري */
function comboRow(product) {
  const name = escapeHTML(product.name || '');
  const url = escapeHTML(product.url || '#');
  const image = escapeHTML(product.image?.url || '');
  const price = product.is_on_sale ? product.sale_price : product.price;
  const wasPrice = product.is_on_sale && product.regular_price > price
    ? `<span class="sawab-combo__was">${salla.money(product.regular_price)}</span>`
    : '';

  return `
    <div class="sawab-combo__item">
      <a class="sawab-combo__thumb" href="${url}" tabindex="-1" aria-hidden="true">
        ${image ? `<img src="${image}" alt="" loading="lazy">` : ''}
      </a>
      <div class="sawab-combo__body">
        <a class="sawab-combo__name" href="${url}">${name}</a>
        <span class="sawab-combo__prices">
          <span class="sawab-combo__price">${salla.money(price)}</span>
          ${wasPrice}
        </span>
      </div>
      <button type="button" class="sawab-combo__add" data-id="${product.id}" aria-label="${TEXTS.addToCart(name)}"></button>
    </div>`;
}

class Product extends BasePage {
    onReady() {
        app.watchElements({
            totalPrice: '.total-price',
            productWeight: '.product-weight',
            beforePrice: '.before-price',
            startingPriceTitle: '.starting-price-title',
            productSku: '.product-sku',
        });

        this.initProductOptionValidations();
        this.initOptionCards();
        this.initQuestionForm();
        this.initComboProducts();
        this.initStickyBuyBar();

        if(imageZoom){
            // call the function when the page is ready
            this.initImagesZooming();
            // listen to screen resizing
            window.addEventListener('resize', () => this.initImagesZooming());
        }
    }

    initProductOptionValidations() {
      document.querySelector('.product-form')?.addEventListener('change', function(){
        // reportValidity() natively focuses/scrolls to the first empty required option mid-edit; read validity instead
        const isComplete = Array.from(this.elements).every(el => !el.willValidate || el.validity.valid);
        isComplete && salla.product.getPrice(new FormData(this));
      });
    }

    /**
     * «يضيفها العملاء عادة مع المنتج»: التاجر يختار ملحقات كل منتج صراحةً من
     * إعدادات الثيم، فتصل معرّفاتها في سمة data-ids ونجلبها بـsource=selected.
     * (كانت تُستنتج من وسم يحتوي «طقم»، لكن فهرسة الوسوم عند سلة تُرجع فارغًا.)
     * ونرسم صفوفًا مصغّرة من البيانات نفسها لا بطاقات سلة الكاملة: البطاقة
     * الكاملة مبنية لشبكة عريضة فتبدو مشوّهة داخل صندوق ضيّق داخل الصفحة.
     */
    initComboProducts() {
      const box = document.querySelector('.sawab-combo');
      // القسم يختفي بصمت عند أي حلقة ناقصة، فأضف ?sawab-debug للرابط ليشرح أين توقّف
      const debug = window.location.search.includes('sawab-debug');
      const log = (...args) => debug && console.info('[sawab-combo]', ...args);

      if (!box) {
        log('لا مربّع في الصفحة ⇒ المنتج بلا وسوم إطلاقًا');
        return;
      }

      // المعرّفات تأتي من إعدادات الثيم عبر سمة data-ids: التاجر يختار
      // ملحقات كل منتج صراحةً، فلا نستنتجها من الوسوم كما كنّا نفعل
      const ids = (box.dataset.ids || '')
        .split(',')
        .map(id => Number(id.trim()))
        .filter(Boolean);
      log('الملحقات المختارة:', ids);

      if (!ids.length) {
        log('لا ملحقات مختارة لهذا المنتج في إعدادات الثيم');
        return;
      }

      // سلة تفرض مصفوفة لـ source_value في مصادر tags/categories/brands/selected
      salla.api.withoutNotifier(() => salla.product.api.fetch({ source: 'selected', source_value: ids }))
        .then(res => {
          const products = (res?.data || [])
            .filter(item => Number(item.id) !== Number(box.dataset.productId))
            .slice(0, 6);
          log('ملحقات الوسم:', products.map(item => item.name));

          if (!products.length) {
            return;
          }

          box.insertAdjacentHTML('beforeend', `<div class="sawab-combo__list">${products.map(comboRow).join('')}</div>`);
          box.hidden = false;
        })
        .catch(error => log('فشل جلب منتجات الوسم:', error));

      // الصفوف تُرسَم بعد التحميل، فنفوّض النقر للصندوق نفسه.
      // quickAdd هي نقطة الإضافة بضغطة (cart/{cart}/item/{product}/quick-add)
      // وهي ما تستخدمه بطاقات سلة. تمرير quantity يحوّل addItem إلى النقطة
      // العادية التي تتطلّب بيانات المنتج كاملة، فنتركها لسلة.
      box.addEventListener('click', event => {
        const btn = event.target.closest('.sawab-combo__add');

        if (!btn) {
          return;
        }

        btn.disabled = true;
        salla.cart.quickAdd(btn.dataset.id)
          .finally(() => {
            btn.disabled = false;
          });
      });
    }

    /**
     * شريط الشراء السفلي (حاسوب فقط، والإخفاء بالأنماط): يظهر حين يخرج صفّ
     * الأزرار الأصلي من الشاشة نحو الأعلى. زرّه يستدعي requestSubmit على الفورم
     * لا نقرة على زر سلة، فيسري تحقّق الخيارات المطلوبة كما في الشراء العادي.
     */
    initStickyBuyBar() {
      const bar = document.querySelector('.sawab-sticky-bar');
      const actions = document.querySelector('.sawab-actions');
      const form = document.querySelector('.product-form');

      if (!bar || !actions || !form) {
        return;
      }

      new IntersectionObserver(([entry]) => {
        // فوق الشاشة فقط: لا يظهر الشريط قبل أن يمرّ العميل بالأزرار
        const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        bar.classList.toggle('is-visible', scrolledPast);
      }, { threshold: 0 }).observe(actions);

      const btn = bar.querySelector('.sawab-sticky-bar__btn');

      if (!btn) {
        return;
      }

      // مؤشّر تحميل حتى تُنهي سلة الإضافة. نُطلقه في المستمعات لا في وعد
      // الإرسال، لأن requestSubmit يمرّ على salla.form.onSubmit ولا يعيد وعدًا
      let release = null;

      const stopLoading = () => {
        clearTimeout(release);
        btn.classList.remove('is-loading');
        btn.disabled = false;
      };

      salla.cart.event.onItemAdded(stopLoading);
      salla.cart.event.onItemAddedFailed(stopLoading);
      // الزائر الذي تطلب سلة تسجيل دخوله: لا إضافة ولا حدث، فنحرّر الزر
      salla.event.on('login::open', stopLoading);

      btn.addEventListener('click', () => {
        if (btn.disabled) {
          return;
        }

        // خيار مطلوب ناقص: reportValidity ينقل العميل إليه، ولا نُظهر تحميلًا
        // لطلب لن يُرسَل أصلًا
        if (typeof form.reportValidity === 'function' && !form.reportValidity()) {
          return;
        }

        btn.classList.add('is-loading');
        btn.disabled = true;
        // شبكة أمان: لو انقطعت الشبكة ولم يصل أي حدث لا يبقى الزر معطّلًا
        release = setTimeout(stopLoading, 10000);

        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
          return;
        }

        form.querySelector('salla-add-product-button button')?.click();
      });
    }

    /**
     * أسئلة العملاء: نستخدم salla.comment.add (نفس نقطة سلة
     * product/{id}/comments) بدل مكوّن salla-comment-form، لأن الأخير مشروط
     * بـ user.can_comment فيرسم فراغًا للزائر ويغيب القسم كله.
     */
    initQuestionForm() {
      const form = document.querySelector('.sawab-questions__form');

      if (!form) {
        return;
      }

      form.addEventListener('submit', event => {
        event.preventDefault();

        if (!form.reportValidity()) {
          return;
        }

        const field = form.querySelector('.sawab-questions__input');
        const btn = form.querySelector('.sawab-questions__submit');
        btn.disabled = true;

        // نرسل للزائر أيضًا: سلة تقبل تعليقات الزوّار وتسجّلها باسم "زائر" حين
        // يسمح إعداد المتجر بذلك، والرفض إن وقع يأتي من السيرفر برسالته
        salla.comment.add({ id: form.dataset.productId, comment: field.value, type: 'product' })
          .then(() => {
            field.value = '';
            salla.notify.success(TEXTS.questionSent);
          })
          .finally(() => {
            btn.disabled = false;
          });
      });
    }

    /**
     * بطاقات الخيارات: سلة تكتب اسم الخيار ثم فرق السعر كنص بين قوسين
     * "1500 لتر (+400 ر.س)"، والتصميم يطلب السعر الكامل للخيار بسطر منفصل.
     *
     * المصدر بطلب واحد على الأكثر — شروط سوق الثيمات تمنع «طلبًا لكل عنصر»
     * (Technical Review 1.5)، وكنا نطلب سعر كل قيمة على حدة (ستة لخزان بست سعات):
     * - منتج بمتغيّرات (مجموعة واحدة وفروق السعر كلها أصفار، فلكل قيمة سعرها):
     *   `products/{id}/details` مع `with: ['skus']` يعيد كل النسخ بأسعارها، وكل نسخة
     *   تحمل `related_option_values` = معرّفات قيم الخيار التي تخصّها.
     * - غير ذلك: سعر المنتج + فرق سعر القيمة، بلا أي طلب. ومع أكثر من مجموعة
     *   هو تقدير، لأن السعر الفعلي يتبع التركيبة كاملةً.
     * لا نستعمل salla.api.product.getDetails: يبثّ حدثًا عامًا يلتقطه
     * salla-product-options. ولا salla.product.getPrice: يغيّر سعر أعلى الصفحة.
     */
    initOptionCards() {
      const options = document.querySelector('salla-product-options');

      if (!options) {
        return;
      }

      const productId = options.getAttribute('product-id');
      const basePrice = Number(options.dataset.basePrice);
      let optionsData = [];

      try {
        optionsData = JSON.parse(options.getAttribute('options') || '[]');
      } catch (e) {
        optionsData = [];
      }

      const additionalPrices = {};

      optionsData.forEach(option => (option.details || []).forEach(detail => {
        additionalPrices[detail.id] = Number(detail.additional_price) || 0;
      }));

      const soleOption = optionsData.length === 1 ? optionsData[0] : null;
      const isVariant = soleOption && (soleOption.details || []).every(detail => !Number(detail.additional_price));

      // قيمة الخيار ⇒ سعرها {amount, currency}؛ يُجلب مرة واحدة عند الحاجة
      let skuPrices = null;
      const loadSkuPrices = () => {
        skuPrices = skuPrices || salla.api.request(`products/${productId}/details`, { params: { with: ['skus'] } }, 'get')
          .then(res => {
            const map = new Map();
            (res?.data?.skus || []).forEach(sku => (sku.related_option_values || [])
              .forEach(valueId => map.set(String(valueId), sku.price)));
            return map;
          })
          .catch(() => new Map());
        return skuPrices;
      };

      const priceOf = (detailId) => {
        const estimate = basePrice + (additionalPrices[detailId] || 0);
        if (!isVariant) {
          return Promise.resolve(estimate);
        }
        return loadSkuPrices().then(map => map.get(String(detailId)) ?? estimate);
      };

      // لا نلمس أبناء البطاقة إطلاقًا: سلة (Stencil) تحتفظ بمرجع لعقدة النص
      // التي رسمتها، فلو استبدلناها بعناصرنا صارت مرجعًا لعقدة منفصلة عن
      // الصفحة، فأي تعديل يجريه التاجر على أسماء الخيارات لا يظهر أبدًا.
      // لذلك نمرّر السعر عبر سمة data ونرسمه بـ ::after في الأنماط.
      const paint = () => {
        options.querySelectorAll('.s-product-options-grid-mode-span').forEach(card => {
          const detailId = card.parentElement?.querySelector('input')?.value;

          if (!detailId || card.dataset.sawabDetail === detailId) {
            return;
          }

          card.dataset.sawabDetail = detailId;

          priceOf(detailId).then(price => {
            const amount = typeof price === 'object' ? Number(price?.amount) : price;
            if (card.dataset.sawabDetail !== detailId || !Number.isFinite(amount)) {
              return;
            }

            // money(price, false) نصّ صريح بلا وسوم — attr() لا يعرض HTML. وسعر
            // النسخة كائن {amount, currency} فيُعرض برمز عملته هو
            card.dataset.sawabPrice = salla.money(price, false);
          });
        });
      };

      paint();
      // البطاقات تُرسم بعد ترطيب المكوّن، وتُعاد رسمها عند تغيّر التوافر
      new MutationObserver(paint).observe(options, { childList: true, subtree: true });
    }

    initImagesZooming() {
      // skip if the screen is not desktop or if glass magnifier
      // is already crated for the image before
      const imageZoom = document.querySelector('.image-slider .magnify-wrapper.swiper-slide-active .img-magnifier-glass');
      if (window.innerWidth  < 1024 || imageZoom) return;
      setTimeout(() => {
          // set delay after the resizing is done, start creating the glass
          // to create the glass in the proper position
          const image = document.querySelector('.image-slider .swiper-slide-active img');
          zoom(image?.id, 2);
      }, 250);
  

      document.querySelector('salla-slider.details-slider').addEventListener('slideChange', (e) => {
          // set delay till the active class is ready
          setTimeout(() => {
              const imageZoom = document.querySelector('.image-slider .swiper-slide-active .img-magnifier-glass');
    
              // if the zoom glass is already created skip
              if (window.innerWidth  < 1024 || imageZoom) return;
              const image = document.querySelector('.image-slider .magnify-wrapper.swiper-slide-active img');
              zoom(image?.id, 2);
          }, 250)
      })
    }

    registerEvents() {
      salla.event.on('product::price.updated.failed',()=>{
        // الصفحة تحوي كتلتَي سعر (أعلى الصفحة وبجانب زر الإضافة)، و app.element
        // يُرجع الأولى فقط — فنستهدفهما معاً حتى لا تبقى إحداهما ظاهرة بسعر قديم
        document.querySelectorAll('.price-wrapper').forEach(el => el.classList.add('hidden'));
        const outOfStock = app.element('.out-of-stock');
        outOfStock.classList.remove('hidden');
        outOfStock.classList.remove('scale-pulse');
        void outOfStock.offsetWidth; // trigger reflow
        outOfStock.classList.add('scale-pulse');
      })
      salla.product.event.onPriceUpdated((res) => {

        app.element('.out-of-stock').classList.add('hidden')
        document.querySelectorAll('.price-wrapper').forEach(el => el.classList.remove('hidden'));

        let data = res.data,
            is_on_sale = data.has_sale_price && data.regular_price > data.price;

        app.startingPriceTitle?.classList.add('hidden');

        app.productWeight.forEach((el) => {el.innerHTML = data.weight || ''});
        app.totalPrice.forEach((el) => {el.innerHTML = salla.money(data.price)});
        app.beforePrice.forEach((el) => {el.innerHTML = salla.money(data.regular_price)});
        app.productSku.forEach((el) => {el.innerHTML = data.sku || ''});

        // سلة تعيد إدراج محتوى زر الإضافة (setText) فتصبح العقد المحفوظة في
        // app.totalPrice قديمة — نستعلم من جديد في كل تحديث

        app.toggleClassIf('.price_is_on_sale','showed','hidden', ()=> is_on_sale)
        app.toggleClassIf('.starting-or-normal-price','hidden','showed', ()=> is_on_sale)

        document.querySelectorAll('.total-price, .product-weight').forEach(el => {
          el.classList.remove('scale-pulse');
          void el.offsetWidth; // trigger reflow
          el.classList.add('scale-pulse');
        });
      });

      app.onClick('#btn-show-more', e => app.all('#more-content', div => {
        e.target.classList.add('is-expanded');
        div.style = `max-height:${div.scrollHeight}px`;
      }) || e.target.remove());
    }
}

Product.initiateWhenReady(['product.single']);
