import { getAllPosts, getPostBySlug } from '@/lib/content'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MDXRenderer } from '@/components/MDXRenderer'

export async function generateStaticParams() {
  const posts = await getAllPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export default async function BlogPostPage({ params }: { params: { slug?: string } }) {
  if (!params?.slug) {
    return notFound()
  }

  const post = await getPostBySlug(params.slug)

  if (!post) {
    return notFound()
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-20 lg:px-8">
      <article className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-10 shadow-glow">
        <p className="text-sm uppercase tracking-[0.3em] text-sky-300">{post.date}</p>
        <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">{post.title}</h1>
        <p className="mt-4 text-lg leading-8 text-slate-300">{post.description}</p>
        <div className="mt-10 prose prose-invert max-w-none">
          <MDXRenderer source={post.source} />
        </div>
      </article>
      <div className="mt-8 text-sm text-slate-400">
        <Link href="/blog" className="text-sky-300 hover:text-sky-100">← Back to articles</Link>
      </div>
    </main>
  )
}
