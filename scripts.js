// ── Lightbox ──
(function () {
    function initLightbox() {
        const trigger = document.getElementById('heroScreenshot');
        const overlay = document.getElementById('lightboxOverlay');
        const closeBtn = document.getElementById('lightboxClose');
        if (!trigger || !overlay) return;

        function open()  {
            if (window.innerWidth <= 1024) return;
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        function close() { overlay.classList.remove('open'); document.body.style.overflow = ''; }

        trigger.addEventListener('click', open);
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLightbox);
    } else {
        initLightbox();
    }
})();

// ── Contact Modal ──
let contactModalLastFocus = null;
let contactModalTrapFn = null;

function getContactOverlay() {
    return document.getElementById('contactOverlay');
}

function contactModalSubtreeHidden(el, overlay) {
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    var p = el.parentElement;
    while (p && p !== overlay) {
        var ps = window.getComputedStyle(p);
        if (ps.display === 'none') return true;
        p = p.parentElement;
    }
    return false;
}

/** Focusable controls inside the open modal for Tab wrapping. */
function getContactModalFocusables(overlay) {
    var modal = overlay.querySelector('.contact-modal');
    var root = modal || overlay;
    var sel =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll(sel)).filter(function (el) {
        return overlay.contains(el) && !el.hasAttribute('hidden') && !contactModalSubtreeHidden(el, overlay);
    });
}

function openContactModal() {
    const overlay = getContactOverlay();
    if (!overlay || overlay.classList.contains('open')) return;

    contactModalLastFocus = document.activeElement;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function () {
        var first =
            document.getElementById('fullName') || overlay.querySelector('button:not([disabled]), input');
        if (first && typeof first.focus === 'function') first.focus();
    });

    contactModalTrapFn = function (e) {
        if (e.key !== 'Tab') return;
        const list = getContactModalFocusables(overlay);
        if (list.length === 0) return;
        const firstEl = list[0];
        const lastEl = list[list.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            }
        } else {
            if (document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        }
    };
    overlay.addEventListener('keydown', contactModalTrapFn);
}

function closeContactModal() {
    const overlay = getContactOverlay();
    if (!overlay || !overlay.classList.contains('open')) return;

    if (contactModalTrapFn) {
        overlay.removeEventListener('keydown', contactModalTrapFn);
        contactModalTrapFn = null;
    }

    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    if (contactModalLastFocus && typeof contactModalLastFocus.focus === 'function') {
        try {
            contactModalLastFocus.focus();
        } catch (e) {
            /* stale element reference */
        }
    }
    contactModalLastFocus = null;
}

document.addEventListener('DOMContentLoaded', function () {
    const overlay = document.getElementById('contactOverlay');
    const closeBtn = document.getElementById('contactClose');
    const form = document.getElementById('contactForm');
    const submitBtn = document.getElementById('submitBtn');
    const submitText = document.getElementById('submitText');
    const submitSpinner = document.getElementById('submitSpinner');

    if (!overlay || !closeBtn || !form || !submitBtn || !submitText || !submitSpinner) {
        return;
    }

    closeBtn.addEventListener('click', closeContactModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeContactModal(); });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (overlay.classList.contains('open')) closeContactModal();
    });

    // Clear error as soon as the user starts typing
    form.querySelectorAll('input[required]').forEach(function (input) {
        input.addEventListener('input', function () {
            input.closest('.form-group').classList.remove('has-error');
        });
    });

    // Phone field: allow digits and hyphens only
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '');
        });
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        // Validate all required fields
        let valid = true;
        form.querySelectorAll('input[required]').forEach(function (input) {
            const group = input.closest('.form-group');
            group.classList.remove('has-error');
            const val        = input.value.trim();
            const isEmpty    = !val;
            const isEmailBad = input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
            // Israeli phone: 0 followed by 8–9 digits, digits only
            const isPhoneBad = input.type === 'tel' && !/^0\d{8,9}$/.test(val);
            if (isEmpty || isEmailBad || isPhoneBad) {
                group.classList.add('has-error');
                valid = false;
            }
        });
        if (!valid) return;

        // Submit via Formspree
        submitText.style.display    = 'none';
        submitSpinner.style.display = 'inline';
        submitBtn.disabled          = true;

        try {
            const res = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { 'Accept': 'application/json' }
            });
            if (res.ok) {
                document.getElementById('contactFormWrap').style.display  = 'none';
                document.getElementById('contactSuccess').style.display   = 'block';
            } else {
                throw new Error('server error');
            }
        } catch (err) {
            submitText.style.display    = 'inline';
            submitSpinner.style.display = 'none';
            submitBtn.disabled          = false;
            alert('שגיאה בשליחה, נסו שוב או פנו אלינו ישירות.');
        }
    });

    if (new URLSearchParams(window.location.search).get('demo') === '1') {
        openContactModal();
        try {
            history.replaceState({}, '', window.location.pathname || '/');
        } catch (e) {
            /* ignore */
        }
    }
});

// ── FAQ Accordion ──
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.faq-question').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const isOpen = this.getAttribute('aria-expanded') === 'true';
            // Close all
            document.querySelectorAll('.faq-question').forEach(function (q) {
                q.setAttribute('aria-expanded', 'false');
                q.nextElementSibling.classList.remove('open');
            });
            // Open clicked (if it was closed)
            if (!isOpen) {
                this.setAttribute('aria-expanded', 'true');
                this.nextElementSibling.classList.add('open');
            }
        });
    });
});
