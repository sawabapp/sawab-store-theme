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
        this.initBuyNow();
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

    initOptionCards() {
      const options = document.querySelector('salla-product-options');

      if (!options) {
        return;
      }

      // سلة تلحق السعر الإضافي كنص بين قوسين بعد اسم الخيار داخل نفس العنصر
      // (الـ<p> مخصص لخيارات الألوان فقط)، فنفصله ليأخذ حجمًا ولونًا مختلفين
      const wrapPrices = () => {
        options.querySelectorAll('.s-product-options-grid-mode-span').forEach(card => {
          if (card.dataset.sawabPriceWrapped) {
            return;
          }

          card.dataset.sawabPriceWrapped = '1';
          const parts = card.innerHTML.trim().match(/^([\s\S]*\S)\s*(\([\s\S]*\))$/);

          if (!parts) {
            return;
          }

          card.innerHTML = `<span class="sawab-option__name">${parts[1]}</span>`
            + `<span class="sawab-option__price">${parts[2]}</span>`;
        });
      };

      wrapPrices();
      // البطاقات تُرسم بعد ترطيب المكوّن، وتُعاد رسمها عند تغيّر التوافر
      new MutationObserver(wrapPrices).observe(options, { childList: true, subtree: true });
    }

    initBuyNow() {
      const form = document.querySelector('.product-form');

      app.onClick('.sawab-buy-now', event => {
        // reportValidity() here is intentional: the shopper asked to check out, so
        // focusing/scrolling to the first missing option is the wanted behaviour
        if (!form || !form.reportValidity()) {
          salla.notify.error(salla.lang.get('common.messages.required_fields'));
          return;
        }

        const btn = event.currentTarget;
        const stopLoading = () => {
          btn.classList.remove('is-loading');
          btn.disabled = false;
        };

        // submit() only redirects for a signed-in shopper; release the button when
        // it opens the login modal or fails instead of leaving it stuck
        salla.event.once('login::open', stopLoading);
        salla.event.once('cart::submit.failed', stopLoading);

        btn.classList.add('is-loading');
        btn.disabled = true;

        salla.cart.addItem(new FormData(form))
          .then(() => salla.cart.submit())
          .catch(stopLoading);
      });
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
