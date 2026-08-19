import 'lite-youtube-embed';
import BasePage from './base-page';
import Fslightbox from 'fslightbox';
window.fslightbox = Fslightbox;
import { zoom } from './partials/image-zoom';

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
      <button type="button" class="sawab-combo__add" data-id="${product.id}" aria-label="أضف ${name} للسلة"></button>
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
     * «يضيفها العملاء عادة مع المنتج» عبر الوسوم: التاجر يضع وسمًا يبدأ بـ«طقم»
     * على المنتج وملحقاته، فنجلب منتجات ذلك الوسم ونستبعد المنتج الحالي.
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

      const tags = Array.from(box.querySelectorAll('.sawab-combo__tag'))
        .map(el => ({ name: el.dataset.name || '', url: el.dataset.url || '' }));
      log('وسوم المنتج:', tags);

      // اصطلاح المشروع: وسم المجموعة يحتوي «طقم»، وبقية الوسوم تسويقية
      const combo = tags.find(tag => tag.name.trim().includes('طقم'));

      if (!combo) {
        log('لا وسم يحتوي كلمة «طقم»');
        return;
      }

      // بيانات الوسم لا تحمل id، فنأخذ آخر رقم في رابطه
      const tagId = (combo.url.match(/(\d+)(?!.*\d)/) || [])[1];
      log('وسم المجموعة:', combo.name, '| الرابط:', combo.url, '| المعرّف:', tagId);

      if (!tagId) {
        log('تعذّر استخراج معرّف رقمي من رابط الوسم');
        return;
      }

      // سلة تفرض مصفوفة لـ source_value في مصادر tags/categories/brands/selected
      salla.api.withoutNotifier(() => salla.product.api.fetch({ source: 'tags', source_value: [Number(tagId)] }))
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
            salla.notify.success('تم إرسال سؤالك، وسيظهر بعد مراجعته من المتجر');
          })
          .finally(() => {
            btn.disabled = false;
          });
      });
    }

    /**
     * بطاقات الخيارات: سلة تكتب اسم الخيار ثم فرق السعر كنص بين قوسين
     * "1500 لتر (+400 ر.س)"، والتصميم يطلب السعر الكامل للخيار بسطر منفصل.
     * نسأل نقطة سعر المنتج عن سعر كل خيار — مباشرةً عبر salla.api.request لا
     * عبر salla.product.getPrice، لأن الأخير يبثّ حدث تحديث السعر فيغيّر سعر
     * أعلى الصفحة مع كل استعلام.
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

      // مجموعة خيارات واحدة ⇒ نسأل سلة عن سعر كل خيار، وهو المصدر الموثوق:
      // يعكس أسعار المتغيّرات والتخفيضات وأي تعديل في لوحة المنتج. أما مع أكثر
      // من مجموعة فالاستعلام يفشل لنقص بقية الخيارات المطلوبة، فنكتفي حينها
      // بـ (سعر المنتج + فرق سعر الخيار) وهو تقدير قد يخالف سعر المتغيّر.
      const soleOption = optionsData.length === 1 ? optionsData[0] : null;
      const fetched = new Map();

      const priceOf = (detailId) => {
        if (!soleOption) {
          return Promise.resolve(basePrice + (additionalPrices[detailId] || 0));
        }

        if (!fetched.has(detailId)) {
          const payload = new FormData();
          payload.append('id', productId);
          payload.append(`options[${soleOption.id}]`, detailId);

          fetched.set(detailId, salla.api.request(`products/${productId}/price`, payload, 'post')
            .then(res => Number(res?.data?.price))
            .catch(() => NaN));
        }

        return fetched.get(detailId);
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
            if (card.dataset.sawabDetail !== detailId || !Number.isFinite(price)) {
              return;
            }

            // money(price, false) نصّ صريح بلا وسوم — attr() لا يعرض HTML
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
        document.querySelectorAll('.sawab-atc__price').forEach((el) => {el.innerHTML = salla.money(data.price)});

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
