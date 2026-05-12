import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Codex Remote",
  description: "Phone bridge for controlling your own PC Codex through a token-protected public URL.",
  base: "/codex-remote/",
  cleanUrls: true,
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/codex-remote/favicon.svg" }],
    ["link", { rel: "manifest", href: "/codex-remote/site.webmanifest" }],
    ["meta", { name: "theme-color", content: "#15151a" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Codex Remote" }],
    ["meta", { property: "og:description", content: "Control your own PC Codex from your phone." }],
    ["meta", { property: "og:image", content: "/codex-remote/social-card.svg" }],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      themeConfig: {
        nav: [
          { text: "Setup", link: "/github-distribution-ja" },
          { text: "Phone Bridge", link: "/guide/phone-bridge" },
          { text: "Security", link: "/guide/security" },
        ],
        sidebar: [
          {
            text: "Guide",
            items: [
              { text: "GitHub Distribution", link: "/github-distribution-ja" },
              { text: "Fixed URL", link: "/fixed-url-ja" },
              { text: "Phone Bridge", link: "/guide/phone-bridge" },
              { text: "Product Mode", link: "/product-mode" },
              { text: "agentmemory", link: "/agentmemory-ja" },
              { text: "Protocol Notes", link: "/guide/protocol" },
              { text: "Security", link: "/guide/security" },
              { text: "X/note Fallback", link: "/x-posting-fallback" },
            ],
          },
        ],
      },
    },
    ja: {
      label: "日本語",
      lang: "ja-JP",
      link: "/ja/",
      themeConfig: {
        nav: [
          { text: "導入", link: "/github-distribution-ja" },
          { text: "Phone Bridge", link: "/ja/guide/phone-bridge" },
          { text: "Security", link: "/ja/guide/security" },
        ],
        sidebar: [
          {
            text: "Guide",
            items: [
              { text: "GitHub Distribution", link: "/github-distribution-ja" },
              { text: "Fixed URL", link: "/fixed-url-ja" },
              { text: "Phone Bridge", link: "/ja/guide/phone-bridge" },
              { text: "agentmemory", link: "/agentmemory-ja" },
              { text: "Protocol Notes", link: "/ja/guide/protocol" },
              { text: "Security", link: "/ja/guide/security" },
            ],
          },
        ],
      },
    },
  },
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Codex Remote",
    search: {
      provider: "local",
    },
  },
});

