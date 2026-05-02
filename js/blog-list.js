(function () {
    var listEl = document.getElementById('blog-posts');
    var statusEl = document.getElementById('blog-status');
    if (!listEl || !statusEl) {
        return;
    }

    function showStatus(msg, isError) {
        statusEl.hidden = false;
        statusEl.textContent = msg;
        statusEl.classList.toggle('blog-status--error', !!isError);
    }

    function formatDate(iso) {
        if (!iso) {
            return '';
        }
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) {
                return '';
            }
            return d.toLocaleDateString('he-IL', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch (_) {
            return '';
        }
    }

    function thumbSrc(url) {
        if (!url || typeof url !== 'string') {
            return '';
        }
        if (url.indexOf('?') !== -1) {
            return url + '&w=480&h=270&fit=max&fm=webp&q=82';
        }
        return url + '?w=480&h=270&fit=max&fm=webp&q=82';
    }

    function renderPosts(posts) {
        listEl.innerHTML = '';
        if (!posts || !posts.length) {
            var empty = document.createElement('p');
            empty.className = 'blog-empty';
            empty.textContent = 'עדיין אין פוסטים — בקרוב יתעדכן כאן תוכן.';
            listEl.appendChild(empty);
            return;
        }

        posts.forEach(function (post) {
            var slug = post.slug;
            if (!slug) {
                return;
            }
            var a = document.createElement('a');
            a.className = 'blog-card';
            a.href = '/blog/' + encodeURIComponent(slug);

            var inner = document.createElement('div');
            inner.className = 'blog-card-inner';

            var thumbUrl = post.thumbUrl && String(post.thumbUrl).trim();
            if (thumbUrl) {
                inner.classList.add('blog-card-inner--has-thumb');
                var thumbWrap = document.createElement('div');
                thumbWrap.className = 'blog-card-thumb';
                var img = document.createElement('img');
                img.src = thumbSrc(thumbUrl);
                img.alt =
                    (post.thumbAlt && String(post.thumbAlt).trim()) ||
                    (post.title && String(post.title).trim()) ||
                    '';
                img.loading = 'lazy';
                img.decoding = 'async';
                img.width = 480;
                img.height = 270;
                thumbWrap.appendChild(img);
                inner.appendChild(thumbWrap);
            } else {
                inner.classList.add('blog-card-inner--no-thumb');
            }

            var body = document.createElement('div');
            body.className = 'blog-card-body';

            var meta = document.createElement('p');
            meta.className = 'blog-card-meta';
            meta.textContent = formatDate(post.publishedAt) || 'מאמר';

            var h = document.createElement('h2');
            h.className = 'blog-card-title';
            h.textContent = post.title || 'ללא כותרת';

            body.appendChild(meta);
            body.appendChild(h);

            if (post.excerpt) {
                var ex = document.createElement('p');
                ex.className = 'blog-card-excerpt';
                ex.textContent = post.excerpt;
                body.appendChild(ex);
            }

            var arrow = document.createElement('span');
            arrow.className = 'blog-card-arrow';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = 'לקריאה';
            body.appendChild(arrow);

            inner.appendChild(body);
            a.appendChild(inner);
            listEl.appendChild(a);
        });
    }

    showStatus('טוען…', false);

    fetch('/.netlify/functions/blog-posts')
        .then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok) {
                    throw new Error((data && data.error) || 'הבקשה נכשלה');
                }
                return data;
            });
        })
        .then(function (posts) {
            statusEl.hidden = true;
            renderPosts(posts);
        })
        .catch(function (err) {
            showStatus(err.message || 'לא הצלחנו לטעון את הרשימה.', true);
        });
})();
