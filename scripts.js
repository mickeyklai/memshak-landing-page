// ── Lightbox ──
(function () {
    function initLightbox() {
        const trigger = document.getElementById('heroScreenshot');
        const overlay = document.getElementById('lightboxOverlay');
        const closeBtn = document.getElementById('lightboxClose');
        if (!trigger || !overlay) return;

        function open()  { overlay.classList.add('open');    document.body.style.overflow = 'hidden'; }
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
function openContactModal() {
    document.getElementById('contactOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeContactModal() {
    document.getElementById('contactOverlay').classList.remove('open');
    document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', function () {
    const overlay    = document.getElementById('contactOverlay');
    const closeBtn   = document.getElementById('contactClose');
    const form       = document.getElementById('contactForm');
    const submitBtn  = document.getElementById('submitBtn');
    const submitText = document.getElementById('submitText');
    const submitSpinner = document.getElementById('submitSpinner');

    closeBtn.addEventListener('click', closeContactModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeContactModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeContactModal(); });

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
});

// ── Video pill switching ──
document.addEventListener('DOMContentLoaded', function () {
    const videoPills = document.querySelectorAll('.video-pill');
    const mainVideo  = document.getElementById('mainVideo');
    if (!mainVideo) return;

    videoPills.forEach(function (pill) {
        pill.addEventListener('click', function () {
            videoPills.forEach(function (p) { p.classList.remove('active'); });
            this.classList.add('active');
            mainVideo.src = 'assets/videos/' + this.getAttribute('data-video') + '.mp4';
            mainVideo.load();
            mainVideo.play();
        });
    });
});
