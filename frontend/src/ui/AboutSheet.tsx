import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Check, Copy, Mail, MapPin, Send, X } from "lucide-react";
import { confetti } from "./art";
import { InstagramIcon, LinkedInIcon } from "./BrandIcons";
import { GitHubIcon } from "./GitHubIcon";
import { ME, SERVICES, WORK, enquiryMailto } from "./me";
import { Sheet } from "./Sheet";

/** Round LinkedIn / GitHub / Instagram / email buttons. */
export function SocialLinks({ size = 17 }: { size?: number }) {
  const links = [
    ME.linkedin && { href: ME.linkedin, label: "LinkedIn", icon: <LinkedInIcon size={size} /> },
    ME.instagram && { href: ME.instagram, label: "Instagram", icon: <InstagramIcon size={size} /> },
    ME.github && { href: ME.github, label: "GitHub", icon: <GitHubIcon size={size} /> },
    { href: `mailto:${ME.email}`, label: "Email", icon: <Mail size={size} aria-hidden="true" /> },
  ].filter(Boolean) as { href: string; label: string; icon: ReactNode }[];
  return (
    <div className="socials">
      {links.map((l, i) => (
        <a
          key={l.label}
          className="social"
          href={l.href}
          target={l.href.startsWith("mailto:") ? undefined : "_blank"}
          rel="noreferrer"
          aria-label={`${ME.name} on ${l.label}`}
          title={l.label}
          style={{ "--i": i } as CSSProperties}
        >
          {l.icon}
        </a>
      ))}
    </div>
  );
}

/** Who made this, what they build, and a quick enquiry that lands in their inbox. */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [need, setNeed] = useState<string>(SERVICES[0].key);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    confetti(e.currentTarget.querySelector(".lead-send"));
    window.location.href = enquiryMailto({ name, need, message });
    setSent(true);
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(ME.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy the email address:", ME.email);
    }
  };

  return (
    <Sheet labelledBy="about-title" className="about-sheet" stagger=".about-item" onClose={onClose}>
      {(close) => (
        <>
          <header className="sheet-head">
            <div className="about-me">
              <span className="me-avatar big" aria-hidden="true">
                {ME.initials}
              </span>
              <div>
                <span className="avail">
                  <span className="avail-dot" aria-hidden="true" /> Open for freelance projects
                </span>
                <h2 id="about-title">
                  Hi, I'm {ME.name.split(" ")[0]}, a <span className="hl">creative developer</span>
                </h2>
                <p className="muted small about-loc">
                  <MapPin size={13} aria-hidden="true" /> {ME.location}
                </p>
              </div>
            </div>
            <button className="sheet-close" onClick={close} aria-label="Close">
              <X size={18} />
            </button>
          </header>

          <div className="about-grid">
            <div className="about-main">
              <p className="about-bio about-item">
                I build websites and web apps that feel alive: interfaces full of motion, like this page, on fast Go
                and Python backends, with AI where it really helps. For 1.5+ years I have taken products from idea to
                launch, from e-commerce stores to multi-tenant SaaS and AI agents.
              </p>

              <h3 className="about-h about-item">What I can build for you</h3>
              <ul className="services">
                {SERVICES.map((s) => (
                  <li key={s.key} className="service about-item" style={{ "--accent": s.color } as CSSProperties}>
                    <strong>{s.key}</strong>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ul>

              <h3 className="about-h about-item">Recent work</h3>
              <ul className="work">
                {WORK.map((w) => (
                  <li key={w.name} className="about-item">
                    {w.url ? (
                      <a href={w.url} target="_blank" rel="noreferrer">
                        <strong>{w.name}</strong> <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    ) : (
                      <strong>{w.name}</strong>
                    )}
                    <span>{w.what}</span>
                  </li>
                ))}
              </ul>
            </div>

            <form className="lead-card about-item" onSubmit={send}>
              <h3>Want a site like this?</h3>
              <p className="small">Tell me what you need. It goes straight to my inbox.</p>

              <fieldset className="need">
                <legend className="field-label">I need a…</legend>
                {SERVICES.map((s) => (
                  <label key={s.key} className={`need-chip${need === s.key ? " on" : ""}`}>
                    <input
                      type="radio"
                      name="need"
                      value={s.key}
                      checked={need === s.key}
                      onChange={() => setNeed(s.key)}
                    />
                    {s.key}
                  </label>
                ))}
              </fieldset>

              <label className="field">
                <span className="field-label">Your name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
              <label className="field">
                <span className="field-label">About your project</span>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="A few lines on what you want to build"
                />
              </label>

              <button type="submit" className="lead-send">
                <Send size={16} aria-hidden="true" /> Send enquiry
              </button>
              <p className="small lead-note" aria-live="polite">
                {sent ? "Your email app should open now with the message ready." : "Opens your email app, ready to send."}{" "}
                <button type="button" className="link-btn" onClick={copyEmail}>
                  {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{" "}
                  {copied ? "Copied" : ME.email}
                </button>
              </p>
              <SocialLinks />
            </form>
          </div>
        </>
      )}
    </Sheet>
  );
}
