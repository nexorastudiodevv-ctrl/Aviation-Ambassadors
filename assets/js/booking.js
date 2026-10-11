document.addEventListener('DOMContentLoaded', () => {
  const options = document.querySelectorAll('.option-card, .method');
  options.forEach((item) => {
    item.addEventListener('click', () => {
      const group = item.parentElement;
      group.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
      item.classList.add('selected');
      const radio = item.querySelector('input');
      if (radio) radio.checked = true;
    });
  });

  const submitBtn = document.querySelector('.submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      alert('تم تأكيد الحجز بنجاح. سيتم إرسال تفاصيل الحجز إلى بريدك الإلكتروني.');
    });
  }
});
