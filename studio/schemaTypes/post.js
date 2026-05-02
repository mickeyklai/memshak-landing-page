import { defineField, defineType } from 'sanity';

const SITE_ORIGIN = 'https://www.maliapp.co.il';

export const post = defineType({
  name: 'post',
  title: 'פוסט בבלוג',
  type: 'document',
  groups: [
    { name: 'content', title: 'תוכן', default: true },
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'כותרת',
      type: 'string',
      group: 'content',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug (בכתובת האתר)',
      type: 'slug',
      group: 'content',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'publishedAt',
      title: 'תאריך פרסום',
      type: 'datetime',
      group: 'content',
    }),
    defineField({
      name: 'excerpt',
      title: 'תקציר',
      description: 'מוצג ברשימת מאמרים וב-RSS. עד ~160 תווים.',
      type: 'text',
      rows: 4,
      group: 'content',
      validation: (Rule) => Rule.max(320),
    }),
    defineField({
      name: 'mainImage',
      title: 'תמונה ראשית',
      type: 'image',
      group: 'content',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          type: 'string',
          title: 'טקסט חלופי לתמונה',
        }),
      ],
    }),
    defineField({
      name: 'body',
      title: 'גוף המאמר',
      type: 'blockContent',
      group: 'content',
    }),

    defineField({
      name: 'seoTitle',
      title: 'כותרת SEO (אופציונלי)',
      description: 'דורסת את תגית </title> אם מולאה.',
      type: 'string',
      group: 'seo',
      validation: (Rule) => Rule.max(70),
    }),
    defineField({
      name: 'seoDescription',
      title: 'תיאור מטא (אופציונלי)',
      description: 'כ-140–160 תווים לסניפט בגוגל.',
      type: 'text',
      rows: 3,
      group: 'seo',
      validation: (Rule) => Rule.max(320),
    }),
    defineField({
      name: 'seoSnippet',
      title: 'תקציר קצר (snippet)',
      type: 'text',
      rows: 2,
      group: 'seo',
      validation: (Rule) => Rule.max(280),
    }),
    defineField({
      name: 'keywords',
      title: 'מילות מפתח / תגיות',
      type: 'array',
      group: 'seo',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
    defineField({
      name: 'focusKeyword',
      title: 'מילת מפתח מרכזית',
      description: 'לעריכה פנימית; נשלח גם ל-meta אם רלוונטי.',
      type: 'string',
      group: 'seo',
    }),
    defineField({
      name: 'seoImage',
      title: 'תמונת שיתוף (OG)',
      description: '1200×630. אם ריק — נלקחת תמונה ראשית.',
      type: 'image',
      group: 'seo',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          type: 'string',
          title: 'טקסט חלופי',
        }),
      ],
    }),
    defineField({
      name: 'noindex',
      title: 'הסתר ממנועי חיפוש',
      type: 'boolean',
      group: 'seo',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      date: 'publishedAt',
      slug: 'slug',
      media: 'mainImage',
    },
    prepare({ title, date, slug, media }) {
      const slugCurrent = slug?.current;
      const url = slugCurrent ? `${SITE_ORIGIN}/blog/${slugCurrent}` : '';
      const datePart = date ? new Date(date).toLocaleDateString('he-IL') : 'טיוטה';
      return {
        title: title || 'ללא כותרת',
        subtitle: url ? `${datePart} · ${url}` : datePart,
        media,
      };
    },
  },
});
