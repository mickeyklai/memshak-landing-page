// ── Lightbox ──
(function () {
    function initLightbox() {
        const triggers = document.querySelectorAll('.lightbox-trigger');
        const overlay = document.getElementById('lightboxOverlay');
        const closeBtn = document.getElementById('lightboxClose');
        const lightboxImg = overlay && overlay.querySelector('.lightbox-img');
        if (!triggers.length || !overlay || !lightboxImg) return;

        function open(src, alt) {
            if (window.innerWidth <= 1024) return;
            lightboxImg.src = src;
            if (alt) lightboxImg.alt = alt;
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        function close() { overlay.classList.remove('open'); document.body.style.overflow = ''; }

        triggers.forEach(function (trigger) {
            trigger.addEventListener('click', function () {
                const src = trigger.dataset.lightboxSrc || trigger.getAttribute('src');
                const img = trigger.querySelector('img') || trigger;
                const alt = img.getAttribute('alt') || '';
                if (src) open(src, alt);
            });
        });
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

// ── Recommendations carousel ──
(function () {
    function initRecommendationsCarousel() {
        const track = document.getElementById('recommendationsTrack');
        const prevBtn = document.getElementById('recommendationsPrev');
        const nextBtn = document.getElementById('recommendationsNext');
        if (!track || !prevBtn || !nextBtn) return;

        function getCards() {
            return Array.from(track.querySelectorAll('.proof-slide'));
        }

        function getLeadingIndex() {
            const cards = getCards();
            if (!cards.length) return 0;

            const trackRect = track.getBoundingClientRect();
            let bestIndex = 0;
            let bestOverlap = -1;

            cards.forEach(function (card, index) {
                const rect = card.getBoundingClientRect();
                const overlap = Math.min(rect.right, trackRect.right) - Math.max(rect.left, trackRect.left);
                if (overlap > bestOverlap) {
                    bestOverlap = overlap;
                    bestIndex = index;
                }
            });

            return bestIndex;
        }

        function scrollToIndex(index) {
            const cards = getCards();
            if (!cards.length) return;

            const clamped = Math.max(0, Math.min(cards.length - 1, index));
            cards[clamped].scrollIntoView({
                behavior: 'smooth',
                inline: 'start',
                block: 'nearest'
            });
        }

        function updateArrows() {
            const cards = getCards();
            const index = getLeadingIndex();
            prevBtn.disabled = index <= 0;
            nextBtn.disabled = index >= cards.length - 1;
        }

        prevBtn.addEventListener('click', function () {
            scrollToIndex(getLeadingIndex() - 1);
        });

        nextBtn.addEventListener('click', function () {
            scrollToIndex(getLeadingIndex() + 1);
        });

        track.addEventListener('scroll', updateArrows, { passive: true });
        window.addEventListener('resize', updateArrows);
        updateArrows();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRecommendationsCarousel);
    } else {
        initRecommendationsCarousel();
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
    const form = document.getElementById('contactForm');
    if (!form) return;

    const overlay = document.getElementById('contactOverlay');
    const closeBtn = document.getElementById('contactClose');
    const submitBtn = form.querySelector('#submitBtn') || form.querySelector('button[type="submit"]');
    const submitText = form.querySelector('#submitText');
    const submitSpinner = form.querySelector('#submitSpinner');

    if (overlay && closeBtn) {
        closeBtn.addEventListener('click', closeContactModal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeContactModal(); });
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (overlay.classList.contains('open')) closeContactModal();
        });
    }

    // Clear error as soon as the user edits the field
    form.querySelectorAll('input[required], select[required]').forEach(function (field) {
        const group = field.closest('.form-group');
        if (!group) return;
        const eventName = field.type === 'checkbox' || field.tagName === 'SELECT' ? 'change' : 'input';
        field.addEventListener(eventName, function () {
            group.classList.remove('has-error');
            if (field.type === 'checkbox') field.setAttribute('aria-invalid', 'false');
        });
    });

    // Phone field: allow digits only
    const phoneInput = form.querySelector('#phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '');
        });
    }

    const referralSelect = form.querySelector('#referralSource');
    const referralOtherWrap = form.querySelector('#referralOtherWrap');
    const referralOtherInput = form.querySelector('#referralOther');

    function updateReferralOther() {
        const isOther = referralSelect && referralSelect.value === 'אחר';
        if (referralOtherWrap) referralOtherWrap.hidden = !isOther;
        if (referralOtherInput) {
            referralOtherInput.required = isOther;
            if (!isOther) {
                referralOtherInput.value = '';
                const otherGroup = referralOtherInput.closest('.form-group');
                if (otherGroup) otherGroup.classList.remove('has-error');
            }
        }
    }

    if (referralSelect) {
        referralSelect.addEventListener('change', updateReferralOther);
        updateReferralOther();
    }

    if (referralOtherInput) {
        referralOtherInput.addEventListener('input', function () {
            const group = referralOtherInput.closest('.form-group');
            if (group) group.classList.remove('has-error');
        });
    }

    form.addEventListener(
        'submit',
        function onContactFormSubmit(e) {
            e.preventDefault();
            e.stopPropagation();

            const formWrap = document.getElementById('contactFormWrap');

            // Validate all required fields and track the first error
            let valid = true;
            let firstErrorGroup = null;

            form.querySelectorAll('input[required], select[required]').forEach(function (field) {
                const group = field.closest('.form-group');
                if (!group) return;
                group.classList.remove('has-error');

                let invalid;
                if (field.type === 'checkbox') {
                    // Checkboxes must be checked — .value is always "כן" regardless of state
                    invalid = !field.checked;
                    field.setAttribute('aria-invalid', invalid ? 'true' : 'false');
                } else {
                    const val = field.value.trim();
                    const isEmailBad = field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
                    // Israeli phone: 0 followed by 8–9 digits, digits only
                    const isPhoneBad = field.type === 'tel' && !/^0\d{8,9}$/.test(val);
                    invalid = !val || isEmailBad || isPhoneBad;
                }

                if (invalid) {
                    group.classList.add('has-error');
                    // Re-trigger shake animation on every failed attempt
                    group.classList.remove('shake');
                    void group.offsetWidth; // force reflow so animation restarts
                    group.classList.add('shake');
                    valid = false;
                    if (!firstErrorGroup) firstErrorGroup = group;
                }
            });

            if (!valid) {
                if (formWrap) formWrap.style.display = '';
                requestAnimationFrame(function () {
                    if (firstErrorGroup) {
                        firstErrorGroup.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        var firstInvalid = firstErrorGroup.querySelector('input, select');
                        if (firstInvalid) { try { firstInvalid.focus(); } catch (err) { /* ignore */ } }
                    }
                });
                return;
            }

            if (!submitBtn || !submitText || !submitSpinner) return;

            submitText.style.display    = 'none';
            submitSpinner.style.display = 'inline';
            submitBtn.disabled          = true;

            fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { Accept: 'application/json' },
            })
                .then(function (res) {
                    if (!res.ok) throw new Error('server error');
                    var wrap = document.getElementById('contactFormWrap');
                    var ok = document.getElementById('contactSuccess');
                    if (wrap) wrap.style.display = 'none';
                    if (ok) ok.style.display = 'block';
                })
                .catch(function () {
                    submitText.style.display    = 'inline';
                    submitSpinner.style.display = 'none';
                    submitBtn.disabled          = false;
                    alert('שגיאה בשליחה, נסו שוב או פנו אלינו ישירות.');
                });
        },
        true,
    );

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
