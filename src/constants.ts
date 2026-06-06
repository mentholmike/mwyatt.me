import { SITE } from "./consts";

// mwyatt.me — keep it tight. GitHub-first, no Twitter/Bluesky.
export const SOCIALS = [
  {
    name: "GitHub",
    href: "https://github.com/mentholmike",
    linkTitle: `${SITE.title} on GitHub`,
    icon: "github",
    active: true,
  },
  {
    name: "Docker Hub",
    href: "https://hub.docker.com/u/itzmizzle",
    linkTitle: `${SITE.title} on Docker Hub`,
    icon: "docker",
    active: true,
  },
  {
    name: "Mail",
    href: "mailto:mike@mwyatt.me",
    linkTitle: `Send an email to ${SITE.title}`,
    icon: "mail",
    active: true,
  },
] as const;

export const SHARE_LINKS = [
  {
    name: "X",
    href: "https://x.com/intent/post?url=",
    linkTitle: "Share this post on X",
    icon: "twitter",
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/sharing/share-offsite/?url=",
    linkTitle: "Share this post on LinkedIn",
    icon: "linkedin",
  },
  {
    name: "Hacker News",
    href: "https://news.ycombinator.com/submitlink?u=",
    linkTitle: "Share this post on Hacker News",
    icon: "hackernews",
  },
  {
    name: "Reddit",
    href: "https://www.reddit.com/submit?url=",
    linkTitle: "Share this post on Reddit",
    icon: "reddit",
  },
  {
    name: "Mail",
    href: "mailto:?subject=See%20this%20post&body=",
    linkTitle: "Share this post via email",
    icon: "mail",
  },
] as const;
