import 'lite-youtube-embed';
import BasePage from './base-page';
import Fslightbox from 'fslightbox';
window.fslightbox = Fslightbox;
import { zoom } from './partials/image-zoom';

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
     * بطاقات الخيارات: سلة تكتب اسم الخيار ثم فرق السعر كنص بين قوسين
     * "1500 لتر (+400 ر.س)"، والتصميم يطلب السعر الكامل للخيار بسطر منفصل.
     * فرق السعر متاح في سمة options، والسعر الكامل = سعر المنتج + الفرق.
     * وللمنتجات ذات المتغيّرات (فرق السعر صفر للجميع) نسأل نقطة سعر المنتج
     * لكل خيار — مباشرةً لا عبر salla.product.getPrice، لأن الأخير يبثّ حدث
     * تحديث السعر فيغيّر سعر أعلى الصفحة مع كل استعلام.
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
      let hasAdditionalPrice = false;

      optionsData.forEach(option => (option.details || []).forEach(detail => {
        additionalPrices[detail.id] = Number(detail.additional_price) || 0;
        hasAdditionalPrice = hasAdditionalPrice || !!additionalPrices[detail.id];
      }));

      // الاستعلام لخيار واحد فقط يصلح حين لا توجد مجموعة خيارات أخرى مطلوبة
      const soleOption = optionsData.length === 1 ? optionsData[0] : null;
      const canCompute = Number.isFinite(basePrice) && hasAdditionalPrice;
      const fetched = new Map();

      const fetchPrice = (detailId) => {
        if (fetched.has(detailId)) {
          return fetched.get(detailId);
        }

        const payload = new FormData();
        payload.append('id', productId);
        payload.append(`options[${soleOption.id}]`, detailId);

        const request = salla.api.request(`products/${productId}/price`, payload, 'post')
          .then(res => Number(res?.data?.price))
          .then(price => Number.isFinite(price) ? price : null)
          .catch(() => null);

        fetched.set(detailId, request);
        return request;
      };

      const setPrice = (card, price) => {
        if (price === null || !card.isConnected) {
          return;
        }

        card.insertAdjacentHTML('beforeend', `<span class="sawab-option__price">${salla.money(price)}</span>`);
      };

      const paint = () => {
        options.querySelectorAll('.s-product-options-grid-mode-span').forEach(card => {
          if (card.dataset.sawabCard) {
            return;
          }

          card.dataset.sawabCard = '1';
          const detailId = card.parentElement?.querySelector('input')?.value;
          // نزيل لاحقة السعر التي تضيفها سلة ونعيدها بسطر خاص
          const name = card.innerHTML.trim().replace(/\s*\([\s\S]*\)\s*$/, '');
          card.innerHTML = `<span class="sawab-option__name">${name}</span>`;

          if (!detailId) {
            return;
          }

          if (canCompute) {
            setPrice(card, basePrice + (additionalPrices[detailId] || 0));
          } else if (soleOption) {
            fetchPrice(detailId).then(price => setPrice(card, price));
          }
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
