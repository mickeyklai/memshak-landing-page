(function () {
    var articleEl = document.getElementById('blog-article');
    var statusEl = document.getElementById('blog-status');
    var titleEl = document.getElementById('blog-article-title');
    var metaEl = document.getElementById('blog-article-meta');
    var dekEl = document.getElementById('blog-article-dek');
    var proseEl = document.getElementById('blog-prose');

    if (!articleEl || !statusEl || !titleEl || !metaEl || !dekEl || !proseEl) {
        return;
    }

    var SITE_ORIGIN = 'https://memshak.co.il';

    function showStatus(msg, isError) {
        statusEl.hidden = false;
        statusEl.innerHTML = '';
        statusEl.textContent = msg;
        statusEl.classList.toggle('blog-status--error', !!isError);
        articleEl.hidden = true;
    }

    function showNotFound() {
        statusEl.hidden = false;
        statusEl.classList.add('blog-status--error');
        statusEl.innerHTML = '';
        var title = document.createElement('p');
        title.className = 'blog-not-found-title';
        title.textContent = 'המאמר לא נמצא';
        var hint = document.createElement('p');
        hint.className = 'blog-not-found-hint';
        hint.textContent = 'ייתכן שהקישור לא מעודכן או שהמאמר הוסר.';
        var a = document.createElement('a');
        a.className = 'blog-not-found-link';
        a.href = '/blog/';
        a.textContent = '← כל המאמרים';
        statusEl.appendChild(title);
        statusEl.appendChild(hint);
        statusEl.appendChild(a);
        articleEl.hidden = true;

        document.title = 'מאמר לא נמצא | מלי — בלוג';
        metaByName('robots').setAttribute('content', 'noindex, nofollow');
        metaByName('description').setAttribute(
            'content',
            'המאמר לא נמצא. חזרה לבלוג מלי — מערכת מייצגים לביטוח לאומי.',
        );
    }

    function hideStatus() {
        statusEl.hidden = true;
        articleEl.hidden = false;
    }

    function getSlugFromPath() {
        var path = window.location.pathname.replace(/\/+$/, '');
        var parts = path.split('/').filter(Boolean);
        var last = parts[parts.length - 1];
        if (!last || last === 'post.html') {
            return '';
        }
        return decodeURIComponent(last);
    }

    function metaByProperty(prop) {
        var el = document.head.querySelector('meta[property="' + prop + '"]');
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('property', prop);
            document.head.appendChild(el);
        }
        return el;
    }

    function metaByName(name) {
        var el = document.head.querySelector('meta[name="' + name + '"]');
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('name', name);
            document.head.appendChild(el);
        }
        return el;
    }

    function upsertJsonLd(id, obj) {
        var existing = document.getElementById(id);
        if (existing) {
            existing.parentNode.removeChild(existing);
        }
        var s = document.createElement('script');
        s.type = 'application/ld+json';
        s.id = id;
        s.textContent = JSON.stringify(obj);
        document.head.appendChild(s);
    }

    function keywordString(post) {
        if (!Array.isArray(post.keywords) || !post.keywords.length) {
            return 'ביטוח לאומי, מייצגים, מלי, ניהול תיקים';
        }
        return post.keywords
            .map(function (x) {
                return String(x || '').trim();
            })
            .filter(Boolean)
            .slice(0, 24)
            .join(', ');
    }

    function setOgFromPost(post) {
        if (!post) {
            return;
        }
        var absUrl = function (u) {
            if (!u) {
                return '';
            }
            try {
                return new URL(u, window.location.origin).href;
            } catch (_) {
                return u;
            }
        };

        var desc =
            (post.seoDescription && String(post.seoDescription).trim()) ||
            (post.seoSnippet && String(post.seoSnippet).trim()) ||
            (post.excerpt && String(post.excerpt).trim()) ||
            'מאמר בבלוג מלי — מערכת מייצגים לביטוח לאומי.';
        var snippet = post.seoSnippet && String(post.seoSnippet).trim();
        var pageUrl = window.location.href.split('#')[0];
        var titleForOg = post.seoTitle || post.title || 'מלי — בלוג';
        var keywords = keywordString(post);
        var noindex = post.noindex === true;
        var robots = noindex
            ? 'noindex, nofollow'
            : 'index, follow, max-image-preview:large, max-snippet:-1';

        metaByName('description').setAttribute('content', desc);
        metaByName('robots').setAttribute('content', robots);
        metaByName('googlebot').setAttribute('content', robots);
        metaByName('author').setAttribute('content', 'מלי פלטפורמות תוכנה');
        metaByName('keywords').setAttribute('content', keywords);
        metaByName('theme-color').setAttribute('content', '#4F46E5');

        metaByProperty('og:type').setAttribute('content', 'article');
        metaByProperty('og:site_name').setAttribute('content', 'מלי');
        metaByProperty('og:locale').setAttribute('content', 'he_IL');
        metaByProperty('og:title').setAttribute('content', titleForOg);
        metaByProperty('og:description').setAttribute('content', desc);
        metaByProperty('og:url').setAttribute('content', pageUrl);
        if (post.publishedAt) {
            metaByProperty('article:published_time').setAttribute(
                'content',
                new Date(post.publishedAt).toISOString(),
            );
        }
        if (post._updatedAt) {
            metaByProperty('article:modified_time').setAttribute(
                'content',
                new Date(post._updatedAt).toISOString(),
            );
        }
        metaByProperty('article:section').setAttribute('content', 'ביטוח לאומי');

        if (post.ogImage) {
            metaByProperty('og:image').setAttribute('content', absUrl(post.ogImage));
            if (post.ogImageWidth) {
                metaByProperty('og:image:width').setAttribute('content', String(post.ogImageWidth));
            }
            if (post.ogImageHeight) {
                metaByProperty('og:image:height').setAttribute('content', String(post.ogImageHeight));
            }
            metaByName('twitter:card').setAttribute('content', 'summary_large_image');
            metaByName('twitter:image').setAttribute('content', absUrl(post.ogImage));
        }

        metaByName('twitter:title').setAttribute('content', titleForOg);
        metaByName('twitter:description').setAttribute('content', desc);

        var link = document.head.querySelector('link[rel="canonical"]');
        if (!link) {
            link = document.createElement('link');
            link.setAttribute('rel', 'canonical');
            document.head.appendChild(link);
        }
        link.setAttribute('href', pageUrl);

        var article = {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
            headline: (post.title || 'מלי').slice(0, 110),
            description: desc.slice(0, 500),
            inLanguage: 'he',
            articleSection: 'ביטוח לאומי',
            keywords: keywords,
            isPartOf: { '@id': SITE_ORIGIN + '/blog/#blog' },
            author: {
                '@type': 'Organization',
                '@id': SITE_ORIGIN + '/#organization',
                name: 'מלי פלטפורמות תוכנה בע\"מ',
                url: SITE_ORIGIN + '/',
            },
            publisher: {
                '@type': 'Organization',
                '@id': SITE_ORIGIN + '/#organization',
                name: 'מלי פלטפורמות תוכנה בע\"מ',
                url: SITE_ORIGIN + '/',
                logo: {
                    '@type': 'ImageObject',
                    url: SITE_ORIGIN + '/assets/images/logo.png',
                    width: 250,
                    height: 60,
                },
            },
        };
        if (post.publishedAt) {
            article.datePublished = new Date(post.publishedAt).toISOString();
        }
        if (post._updatedAt) {
            article.dateModified = new Date(post._updatedAt).toISOString();
        } else if (post.publishedAt) {
            article.dateModified = new Date(post.publishedAt).toISOString();
        }
        if (snippet) {
            article.abstract = snippet.slice(0, 320);
        }
        if (post.ogImage) {
            article.image = {
                '@type': 'ImageObject',
                url: absUrl(post.ogImage),
                width: post.ogImageWidth || undefined,
                height: post.ogImageHeight || undefined,
            };
        }
        upsertJsonLd('ld-article', article);

        upsertJsonLd('ld-breadcrumb', {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE_ORIGIN + '/' },
                {
                    '@type': 'ListItem',
                    position: 2,
                    name: 'בלוג',
                    item: SITE_ORIGIN + '/blog/',
                },
                { '@type': 'ListItem', position: 3, name: post.title || 'מאמר', item: pageUrl },
            ],
        });
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

    var slug = getSlugFromPath();
    if (!slug) {
        showStatus('לא נבחר מאמר.', true);
        return;
    }

    showStatus('טוען…', false);

    var url = '/.netlify/functions/blog-post?slug=' + encodeURIComponent(slug);

    fetch(url, { cache: 'no-store' })
        .then(function (res) {
            return res.json().then(function (data) {
                if (res.status === 404) {
                    var err = new Error('NOT_FOUND');
                    err.code = 'NOT_FOUND';
                    throw err;
                }
                if (!res.ok) {
                    throw new Error((data && data.error) || 'הבקשה נכשלה');
                }
                return data;
            });
        })
        .then(function (post) {
            hideStatus();
            document.title = (post.title ? post.title + ' | ' : '') + 'מלי — בלוג';

            setOgFromPost(post);

            titleEl.textContent = post.title || 'ללא כותרת';
            metaEl.textContent = formatDate(post.publishedAt) || 'מאמר';

            var dek =
                (post.excerpt && String(post.excerpt).trim()) ||
                (post.seoSnippet && String(post.seoSnippet).trim());
            if (dek) {
                dekEl.hidden = false;
                dekEl.textContent = dek;
            } else {
                dekEl.hidden = true;
                dekEl.textContent = '';
            }

            proseEl.innerHTML = post.bodyHtml || '';

            var urls = post.imageUrls;
            if (urls && urls.length) {
                var nImg = proseEl.querySelectorAll('img').length;
                for (var i = nImg; i < urls.length; i++) {
                    var src = urls[i];
                    if (!src) {
                        continue;
                    }
                    var fig = document.createElement('figure');
                    fig.className = 'blog-prose-figure';
                    var img = document.createElement('img');
                    img.src = src;
                    img.alt = '';
                    img.decoding = 'async';
                    img.loading = i === 0 && nImg === 0 ? 'eager' : 'lazy';
                    fig.appendChild(img);
                    proseEl.appendChild(fig);
                }
            }
        })
        .catch(function (err) {
            if (err && err.code === 'NOT_FOUND') {
                showNotFound();
                return;
            }
            showStatus(err.message || 'לא ניתן לטעון את המאמר.', true);
        });
})();
