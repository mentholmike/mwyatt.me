// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

interface SocialLink {
  href: string;
  label: string;
}

interface Site {
  website: string;
  author: string;
  profile: string;
  desc: string;
  title: string;
  ogImage: string;
  lightAndDarkMode: boolean;
  postPerIndex: number;
  postPerPage: number;
  scheduledPostMargin: number;
  showArchives: boolean;
  showBackButton: boolean;
  editPost: {
    enabled: boolean;
    text: string;
    url: string;
  };
  dynamicOgImage: boolean;
  lang: string;
  timezone: string;
}

// Site configuration — mwyatt.me
export const SITE: Site = {
  website: "https://mwyatt.me/",
  author: "Mike Wyatt",
  profile: "https://mwyatt.me/about",
  desc: "Infrastructure engineer, Kubernetes in progress, and the operator of Lethe memory layer + WAGMIOS. Build logs, post-mortems, and the levers I used.",
  title: "Mike Wyatt",
  ogImage: "og-default.png",
  lightAndDarkMode: true,
  postPerIndex: 10,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000,
  showArchives: false,
  showBackButton: false,
  editPost: {
    enabled: true,
    text: "Edit on GitHub",
    url: "https://github.com/mentholmike/mwyatt.me/edit/main/",
  },
  dynamicOgImage: false,
  lang: "en",
  timezone: "America/New_York",
};

export const SITE_TITLE = SITE.title;
export const SITE_DESCRIPTION = SITE.desc;

// Navigation links
export const NAV_LINKS: SocialLink[] = [
  {
    href: "/",
    label: "Blog",
  },
  {
    href: "/about",
    label: "About",
  },
];

// Social media links
export const SOCIAL_LINKS: SocialLink[] = [
  {
    href: "https://github.com/mentholmike",
    label: "GitHub",
  },
  {
    href: "https://hub.docker.com/u/itzmizzle",
    label: "Docker Hub",
  },
  {
    href: "/rss.xml",
    label: "RSS",
  },
];

// Icon map for social media
export const ICON_MAP: Record<string, string> = {
  GitHub: "github",
  "Docker Hub": "docker",
  RSS: "rss",
  Email: "mail",
};
