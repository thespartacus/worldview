import Link from 'next/link'
import { getAllPosts } from '@/lib/content'
import { ArticleCard } from '@/components/ArticleCard'

export default async function BlogPage() {
  const posts = await getAllPosts()

  return (
    <main className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
      <div className="mb-12 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-sky-300">Blog</p>
        <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">Satellite intelligence stories</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-400">
          Dive into technical articles and research narratives built with editable MDX content.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {posts.map((post) => (
          <ArticleCard key={post.slug} post={post} />
        ))}
      </div>
      <div className="mt-10 text-center text-sm text-slate-500">
        <Link href="/" className="text-sky-300 hover:text-sky-100">Back to home</Link>
      </div>
    </main>
  )
}
