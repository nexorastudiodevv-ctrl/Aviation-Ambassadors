document.addEventListener('DOMContentLoaded', () => {
  const cta = document.querySelector('.cta-btn');
  if (cta) {
    cta.addEventListener('click', () => {
      console.info('الانتقال إلى صفحة الحجز...');
    });
  }
});
