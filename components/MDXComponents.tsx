import type { ComponentPropsWithoutRef } from 'react'

export const mdxComponents = {
  a: ({ href, ...props }: ComponentPropsWithoutRef<'a'>) => (
    <a href={href} className="text-sky-300 underline decoration-sky-500/40 transition hover:text-sky-100" {...props} />
  ),
  h2: ({ ...props }: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="mt-12 scroll-mt-20 text-3xl font-semibold text-white" {...props} />
  ),
  h3: ({ ...props }: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="mt-10 scroll-mt-20 text-2xl font-semibold text-white" {...props} />
  ),
  p: ({ ...props }: ComponentPropsWithoutRef<'p'>) => (
    <p className="mt-6 leading-8 text-slate-300" {...props} />
  ),
  ul: ({ ...props }: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="mt-6 list-disc space-y-3 pl-6 text-slate-300" {...props} />
  ),
  li: ({ ...props }: ComponentPropsWithoutRef<'li'>) => <li className="leading-8" {...props} />,
  blockquote: ({ ...props }: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="mt-8 rounded-3xl border-l-4 border-sky-500/60 bg-slate-900/80 p-6 text-slate-200" {...props} />
  ),
}
