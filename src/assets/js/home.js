import "lite-youtube-embed";
import BasePage from "./base-page";
import Lightbox from "fslightbox";
window.fslightbox = Lightbox;

class Home extends BasePage {
    onReady() {
        this.initFeaturedTabs();
        this.initProductOfWeekPrice();
    }

    /**
     * «منتج الأسبوع»: تحديث السعر عند تغيير خيار.
     *
     * منطق السعر كلّه في product.js وهو لا يُحمَّل في الصفحة الرئيسية، فننقل
     * أقلّ ما يلزم: نسأل سلة عن السعر عند كل تغيير في الفورم، ونكتب الناتج في
     * كتلة السعر. نحصر التحديث داخل القسم حتى لا يمسّ أي سعر آخر في الصفحة.
     */
    initProductOfWeekPrice() {
        const form = document.querySelector('.sawab-pow__form');
        if (!form) return;

        const section = form.closest('.sawab-pow');

        form.addEventListener('change', function () {
            // الاستعلام فقط حين تكتمل الخيارات المطلوبة، وإلا ردّت سلة بخطأ
            const isComplete = Array.from(this.elements).every(el => !el.willValidate || el.validity.valid);
            isComplete && salla.product.getPrice(new FormData(this));
        });

        salla.product.event.onPriceUpdated((res) => {
            const data = res?.data;
            if (!data || !section) return;

            section.querySelectorAll('.total-price').forEach(el => {
                el.innerHTML = salla.money(data.price);
            });

            const was = section.querySelector('.before-price');
            if (!was) return;

            const onSale = data.has_sale_price && data.regular_price > data.price;
            was.innerHTML = salla.money(data.regular_price);
            was.classList.toggle('hidden', !onSale);
        });
    }

    /**
     * used in views/components/home/featured-products-style*.twig
     */
    initFeaturedTabs() {
        app.all('.tab-trigger', el => {
            el.addEventListener('click', ({ currentTarget: btn }) => {
                let id = btn.dataset.componentId;
                // btn.setAttribute('fill', 'solid');
                app.toggleClassIf(`#${id} .tabs-wrapper>div`, 'is-active opacity-0 translate-y-3', 'inactive', tab => tab.id == btn.dataset.target)
                    .toggleClassIf(`#${id} .tab-trigger`, 'is-active', 'inactive', tabBtn => tabBtn == btn);

                // fadeIn active tabe
                setTimeout(() => app.toggleClassIf(`#${id} .tabs-wrapper>div`, 'opacity-100 translate-y-0', 'opacity-0 translate-y-3', tab => tab.id == btn.dataset.target), 100);
            })
        });
        document.querySelectorAll('.s-block-tabs').forEach(block => block.classList.add('tabs-initialized'));
    }
}

Home.initiateWhenReady(['index']);