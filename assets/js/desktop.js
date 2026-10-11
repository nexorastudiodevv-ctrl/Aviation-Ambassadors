const desktopNav = document.getElementById('desktopNav');
const desktopNavToggle = document.getElementById('desktopNavToggle');

if (desktopNavToggle && desktopNav) {
  desktopNavToggle.addEventListener('click', () => {
    desktopNav.classList.toggle('open');
  });
}

const year = document.getElementById('year');
if (year) {
  year.textContent = new Date().getFullYear();
}
