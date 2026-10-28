/**
 * نصوص الجافاسكربت المترجمة.
 *
 * salla.lang لا يرى مفاتيح src/locales، أما trans() في twig فيراها. فيطبعها
 * master.twig مترجمةً على العنصر #sawab-i18n كسمات data-*، وهذه الدالة تقرؤها:
 * t('cart-empty') ⇐ data-cart-empty. والمتغيّرات تُكتب في النص :name أو :amount
 * وتُمرَّر هنا: t('choose-option', { name: 'السعة' }).
 */
export default function t(key, params = {}) {
  const el = document.getElementById('sawab-i18n');
  const prop = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  let text = el?.dataset[prop] || '';

  Object.entries(params).forEach(([name, value]) => {
    text = text.split(`:${name}`).join(value);
  });

  return text;
}
