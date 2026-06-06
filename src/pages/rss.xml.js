import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import { SITE } from "../consts";

export async function GET(context) {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) =>
      new Date(b.data.pubDatetime).getTime() -
      new Date(a.data.pubDatetime).getTime(),
  );

  return rss({
    title: SITE.title,
    description: SITE.desc,
    site: context.site ?? SITE.website,
    items: posts.map((post) => {
      const slug = post.id.replace(/\.[^.]+$/, "").replace(/\/index$/, "");
      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: new Date(post.data.pubDatetime),
        link: `/posts/${slug}`,
        categories: post.data.tags,
        author: `${SITE.author} (mike@mwyatt.me)`,
      };
    }),
  });
}
