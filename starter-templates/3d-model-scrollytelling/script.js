(function () {
  'use strict';

  function throttle(fn, limit) {
    let inThrottle = false;
    return function throttled() {
      const args = arguments;
      const ctx = this;
      if (!inThrottle) {
        fn.apply(ctx, args);
        inThrottle = true;
        setTimeout(function () {
          inThrottle = false;
        }, limit);
      }
    };
  }

  function setupParallax() {
    var elements = document.querySelectorAll('[data-speed]');
    if (!elements.length) return;

    window.addEventListener(
      'scroll',
      throttle(function () {
        var scrolled = window.pageYOffset;
        elements.forEach(function (el) {
          var speed = parseFloat(el.getAttribute('data-speed')) || 0.3;
          el.style.transform = 'translateY(' + -(scrolled * speed) + 'px)';
        });
      }, 16)
    );
  }

  function setupScrollProgress() {
    var bar = document.querySelector('.scroll-progress');
    if (!bar) return;

    window.addEventListener(
      'scroll',
      throttle(function () {
        var scrollTop = window.pageYOffset;
        var docHeight = document.body.offsetHeight - window.innerHeight;
        var pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        bar.style.width = pct + '%';
      }, 16)
    );
  }

  function triggerAnimation(el, type) {
    if (type === 'slide-up') {
      el.style.transform = 'translateY(0)';
      el.style.opacity = '1';
    }
    el.classList.add('visible');
  }

  function setupScrollAnimations() {
    var animated = document.querySelectorAll('[data-scroll]');
    if (!animated.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var type = el.getAttribute('data-scroll') || 'fade-in';
          var delay = parseInt(el.getAttribute('data-delay') || '0', 10);
          setTimeout(function () {
            triggerAnimation(el, type);
          }, delay);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    animated.forEach(function (el) {
      observer.observe(el);
    });

    document.querySelectorAll('.embed-section').forEach(function (section) {
      observer.observe(section);
    });
  }

  function setupSmoothNav() {
    document.querySelectorAll('.nav-links a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var target = document.querySelector(link.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        var top = target.getBoundingClientRect().top + window.pageYOffset - 72;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });
  }

  function setupModelScrolly() {
    var model = document.getElementById('story-model');
    var caption = document.getElementById('model-caption');
    var steps = document.querySelectorAll('.model-scrolly__steps .step');
    if (!model || !steps.length) return;

    var currentSrc = model.getAttribute('src') || '';

    function applyStep(step) {
      if (!step) return;
      steps.forEach(function (s) {
        s.classList.toggle('is-active', s === step);
      });

      var orbit = step.getAttribute('data-orbit');
      if (orbit) {
        model.setAttribute('camera-orbit', orbit);
      }

      var nextSrc = step.getAttribute('data-src');
      if (nextSrc && nextSrc !== currentSrc) {
        currentSrc = nextSrc;
        model.setAttribute('src', nextSrc);
      }

      if (caption) {
        caption.textContent = step.getAttribute('data-caption') || '';
      }
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            applyStep(entry.target);
          }
        });
      },
      {
        root: null,
        threshold: 0.55,
        rootMargin: '-20% 0px -20% 0px',
      }
    );

    steps.forEach(function (step) {
      observer.observe(step);
    });

    applyStep(steps[0]);
  }

  function setupCardHover() {
    document.querySelectorAll('.info-card').forEach(function (card) {
      card.addEventListener('mouseenter', function () {
        if (!card.classList.contains('visible')) return;
        card.style.transform = 'translateY(-4px)';
      });
      card.addEventListener('mouseleave', function () {
        if (!card.classList.contains('visible')) return;
        card.style.transform = 'translateY(0)';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupParallax();
    setupScrollProgress();
    setupScrollAnimations();
    setupSmoothNav();
    setupModelScrolly();
    setupCardHover();
  });
})();
