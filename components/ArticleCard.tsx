import Link from 'next/link'

type ArticleCardProps = {
  post: {
    title: string
    description: string
    date: string
    slug: string
  }
}

export function ArticleCard({ post }: ArticleCardProps) {
  return (
    <article className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-8 transition hover:-translate-y-1 hover:border-sky-500/40 hover:shadow-glow">
      <div className="flex items-center justify-between text-sm text-sky-300">
        <span>{post.date}</span>
        <span className="font-semibold">Article</span>
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-white">{post.title}</h2>
      <p className="mt-4 text-slate-400">{post.description}</p>
      <Link href={`/blog/${post.slug}`} className="mt-6 inline-flex text-sm font-semibold text-sky-300 hover:text-sky-100">
        Read article →
      </Link>
    </article>
  )
}
