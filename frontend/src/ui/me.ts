// The person behind Signify, shown on the home page's contact tile and in
// the About sheet. Edit here; leave a link null to hide its button.
export const ME = {
  name: "Pranav T",
  initials: "PT",
  role: "Creative developer",
  location: "Kozhikode, Kerala · working with clients worldwide",
  email: "pranavt108@gmail.com",
  linkedin: "https://www.linkedin.com/in/me-pranav",
  github: "https://github.com/Pranav-Conova",
  instagram: null as string | null,
};

/** What someone can hire for; the first word goes in the enquiry subject. */
export const SERVICES = [
  {
    key: "Creative website",
    color: "var(--c-green)",
    text: "Landing pages and portfolios with motion people remember, like this one.",
  },
  {
    key: "Web app / SaaS",
    color: "var(--c-violet)",
    text: "Dashboards, real-time apps and multi-tenant platforms, from idea to launch.",
  },
  {
    key: "E-commerce store",
    color: "var(--c-orange)",
    text: "Shops with payments, sign-in and fast, low-cost serverless hosting.",
  },
  {
    key: "AI integration",
    color: "var(--c-blue)",
    text: "LLM features, AI agents and automations that save your team hours.",
  },
] as const;

export const WORK: { name: string; what: string; url?: string }[] = [
  { name: "Signify", what: "This site · gesture-controlled slides, published in IRJMETS" },
  { name: "Oldreport", what: "E-commerce for a clothing brand · React, Go, Razorpay", url: "https://oldreport.in" },
  { name: "SBM Cargo", what: "Mobile-first site for a logistics company", url: "https://sbmcargoservices.com" },
  { name: "TRIPMATIK", what: "Multi-tenant SaaS platform, co-built from scratch" },
];

/** A ready-to-send email in the visitor's mail app. */
export function enquiryMailto({ name, need, message }: { name: string; need: string; message: string }) {
  const subject = `Project enquiry: ${need} (via Signify)`;
  const body = [
    `Hi ${ME.name.split(" ")[0]},`,
    "",
    message.trim() || `I'd like to talk about a ${need.toLowerCase()}.`,
    "",
    name.trim() ? `- ${name.trim()}` : "",
  ].join("\n");
  return `mailto:${ME.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
