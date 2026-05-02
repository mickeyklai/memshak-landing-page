import { defineArrayMember, defineField, defineType } from 'sanity';

export const blockContent = defineType({
  name: 'blockContent',
  title: 'תוכן מאמר',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'רגיל', value: 'normal' },
        { title: 'כותרת 1', value: 'h1' },
        { title: 'כותרת 2', value: 'h2' },
        { title: 'כותרת 3', value: 'h3' },
        { title: 'כותרת 4', value: 'h4' },
        { title: 'ציטוט', value: 'blockquote' },
      ],
      marks: {
        decorators: [
          { title: 'מודגש', value: 'strong' },
          { title: 'הדגשה', value: 'em' },
          { title: 'קוד', value: 'code' },
          { title: 'קו תחתון', value: 'underline' },
          { title: 'קו חוצה', value: 'strike-through' },
        ],
        annotations: [
          {
            name: 'link',
            type: 'object',
            title: 'קישור',
            fields: [
              {
                name: 'href',
                type: 'url',
                title: 'URL',
                validation: (Rule) => Rule.uri({ allowRelative: true }),
              },
            ],
          },
        ],
      },
    }),
    defineArrayMember({
      type: 'image',
      title: 'תמונה',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          type: 'string',
          title: 'טקסט חלופי',
        }),
        defineField({
          name: 'caption',
          type: 'string',
          title: 'כיתוב',
        }),
      ],
    }),
  ],
});
