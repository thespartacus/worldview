import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'

const postsPath = path.join(process.cwd(), 'content/posts')
const pagesPath = path.join(process.cwd(), 'content/pages')

export type PostItem = {
  title: string
  description: string
  date: string
  slug: string
  url: string
  source: string
}

export type PageItem = {
  title: string
  description: string
  slug: string
  url: string
  source: string
}

export async function getPostSlugs() {
  const files = await fs.readdir(postsPath)
  return files.filter((file) => file.endsWith('.mdx')).map((file) => file.replace(/\.mdx$/, ''))
}

export async function getPostBySlug(slug: string) {
  const fullPath = path.join(postsPath, `${slug}.mdx`)
  const fileContents = await fs.readFile(fullPath, 'utf8')
  const { data, content } = matter(fileContents)

  return {
    title: String(data.title),
    description: String(data.description),
    date: String(data.date),
    slug,
    url: `/blog/${slug}`,
    source: content,
  }
}

export async function getAllPosts() {
  const slugs = await getPostSlugs()
  const posts = await Promise.all(slugs.map(getPostBySlug))
  return posts.sort((a, b) => b.date.localeCompare(a.date))
}

export async function getPageSlugs() {
  const files = await fs.readdir(pagesPath)
  return files.filter((file) => file.endsWith('.mdx')).map((file) => file.replace(/\.mdx$/, ''))
}

export async function getPageBySlug(slug: string) {
  const fullPath = path.join(pagesPath, `${slug}.mdx`)
  const fileContents = await fs.readFile(fullPath, 'utf8')
  const { data, content } = matter(fileContents)

  return {
    title: String(data.title),
    description: String(data.description),
    slug,
    url: `/${slug}`,
    source: content,
  }
}

export async function getAllPages() {
  const slugs = await getPageSlugs()
  return Promise.all(slugs.map(getPageBySlug))
}
