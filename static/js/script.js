function scrollToSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (target) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

const analystBtn = document.getElementById("analystBtn");
const publicBtn = document.getElementById("publicBtn");
const policyBtn = document.getElementById("policyBtn");

const analystView = document.getElementById("analystView");
const publicView = document.getElementById("publicView");
const policyView = document.getElementById("policyView");

function showInsight(viewToShow, buttonToActivate) {
  const views = [analystView, publicView, policyView];
  const buttons = [analystBtn, publicBtn, policyBtn];

  views.forEach((view) => {
    view.classList.add("hidden-view");
  });

  buttons.forEach((button) => {
    button.classList.remove("active");
  });

  viewToShow.classList.remove("hidden-view");
  buttonToActivate.classList.add("active");
}

if (analystBtn && publicBtn && policyBtn) {
  analystBtn.addEventListener("click", () => {
    showInsight(analystView, analystBtn);
  });

  publicBtn.addEventListener("click", () => {
    showInsight(publicView, publicBtn);
  });

  policyBtn.addEventListener("click", () => {
    showInsight(policyView, policyBtn);
  });
}

const revealElements = document.querySelectorAll(".reveal");

function revealOnScroll() {
  revealElements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    if (rect.top < windowHeight - 80) {
      element.classList.add("visible");
    }
  });
}

window.addEventListener("scroll", revealOnScroll);
window.addEventListener("load", revealOnScroll);

const navMenuBtn = document.getElementById("navMenuBtn");
const mobileMenu = document.getElementById("mobileMenu");
const navScrollLinks = document.querySelectorAll(".nav-scroll");

if (navMenuBtn && mobileMenu) {
  navMenuBtn.addEventListener("click", () => {
    mobileMenu.classList.toggle("show");
  });
}

navScrollLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (mobileMenu) {
      mobileMenu.classList.remove("show");
    }
  });
});